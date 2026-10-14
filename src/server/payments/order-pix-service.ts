import "server-only";

import { createHash } from "node:crypto";
import { normalizeAppUrl } from "@/lib/app-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveExternalPaymentPolicy } from "@/server/payments/external-payment-policy";
import {
  forceRefreshMercadoPagoCredentials,
  getUsableMercadoPagoCredentials,
} from "@/server/payments/mercado-pago-credential-service";
import {
  OrderPaymentProviderConfigService,
  type OrderPaymentProviderHealthErrorCode,
  type OrderPaymentProviderKey,
} from "@/server/payments/order-payment-provider-config-service";
import {
  forceRefreshPagBankCredentials,
  getUsablePagBankCredentials,
} from "@/server/payments/pagbank-credential-service";
import {
  MercadoPagoOrderProvider,
  MercadoPagoProviderHttpError,
} from "@/server/payments/providers/mercado-pago-order-provider";
import type { OnlinePixProviderOrder, OrderPaymentProvider } from "@/server/payments/providers/order-payment-provider";
import {
  PagBankOrderProvider,
  PagBankProviderHttpError,
  isValidCpf,
  onlyDigits,
} from "@/server/payments/providers/pagbank-order-provider";

type ChargeRow = {
  id: string;
  organization_id: string;
  store_id: string;
  order_id: string;
  payment_id: string;
  provider: OrderPaymentProviderKey;
  attempt: number;
  status: "creating" | "pending" | "paid" | "expired" | "canceled" | "failed";
  amount_cents: number | string;
  currency: "BRL";
  idempotency_key: string;
  external_reference: string;
  provider_order_id: string | null;
  provider_payment_id: string | null;
  qr_code: string | null;
  qr_code_base64: string | null;
  ticket_url: string | null;
  expires_at: string | null;
  last_reconciled_at: string | null;
  last_error_code: string | null;
};

export type PublicPixPayment = {
  /** needs_document: o PagBank exige o CPF do cliente antes de gerar o QR Code. */
  status: "preparing" | "waiting" | "paid" | "expired" | "unavailable" | "needs_document";
  amountCents: number;
  qrCode: string | null;
  qrCodeBase64: string | null;
  ticketUrl: string | null;
  expiresAt: string | null;
};

function publicProjection(charge: ChargeRow): PublicPixPayment {
  const status = charge.status === "paid"
    ? "paid"
    : charge.status === "expired" || charge.status === "canceled"
      ? "expired"
      : charge.status === "failed"
        ? "unavailable"
        : charge.status === "pending" && charge.qr_code
          ? "waiting"
          : "preparing";
  return {
    status,
    amountCents: Number(charge.amount_cents),
    qrCode: charge.qr_code,
    qrCodeBase64: charge.qr_code_base64,
    ticketUrl: charge.ticket_url,
    expiresAt: charge.expires_at,
  };
}

function safeExpiry(value: string | null) {
  if (value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  return new Date(Date.now() + 30 * 60 * 1000).toISOString();
}

function assertProviderMatches(charge: ChargeRow, remote: OnlinePixProviderOrder) {
  if (remote.externalReference !== charge.external_reference) throw new Error("PIX provider reference mismatch");
  if (remote.amountCents !== Number(charge.amount_cents)) throw new Error("PIX provider amount mismatch");
  if (remote.currency !== charge.currency) throw new Error("PIX provider currency mismatch");
}

export class PixPayerDocumentError extends Error {
  constructor() {
    super("O PagBank recusou o CPF informado");
    this.name = "PixPayerDocumentError";
  }
}

function providerHealthErrorCode(error: unknown, providerKey: OrderPaymentProviderKey = "mercado_pago"): OrderPaymentProviderHealthErrorCode {
  if (providerKey === "pagbank") {
    if (error instanceof PagBankProviderHttpError) {
      if (error.status === 401 || error.status === 403) return "pagbank_auth_failed";
      if (error.status === 429 || error.status >= 500) return "pagbank_provider_unavailable";
    }
    return "pagbank_request_failed";
  }
  if (error instanceof MercadoPagoProviderHttpError) {
    if (error.status === 401 || error.status === 403) return "mercado_pago_auth_failed";
    if (error.status === 429 || error.status >= 500) return "mercado_pago_provider_unavailable";
  }
  return "mercado_pago_request_failed";
}

async function recordHealthy(storeId: string, providerKey: OrderPaymentProviderKey = "mercado_pago") {
  await OrderPaymentProviderConfigService.recordHealth(storeId, { status: "healthy" }, providerKey).catch(() => undefined);
}

async function recordProviderError(storeId: string, error: unknown, override?: OrderPaymentProviderHealthErrorCode, providerKey: OrderPaymentProviderKey = "mercado_pago") {
  await OrderPaymentProviderConfigService.recordHealth(storeId, {
    status: "error",
    errorCode: override ?? providerHealthErrorCode(error, providerKey),
  }, providerKey).catch(() => undefined);
}

async function withMercadoPagoProvider<T>(
  storeId: string,
  operation: (provider: MercadoPagoOrderProvider) => Promise<T>,
): Promise<T> {
  const credentials = await getUsableMercadoPagoCredentials(storeId);
  try {
    const result = await operation(new MercadoPagoOrderProvider(credentials.access_token));
    await recordHealthy(storeId);
    return result;
  } catch (error) {
    const authRejected = error instanceof MercadoPagoProviderHttpError && (error.status === 401 || error.status === 403);
    if (!authRejected || credentials.connection_mode !== "oauth") {
      await recordProviderError(storeId, error);
      throw error;
    }

    let refreshed;
    try {
      refreshed = await forceRefreshMercadoPagoCredentials(storeId);
    } catch (refreshError) {
      await recordProviderError(storeId, refreshError, "mercado_pago_auth_failed");
      throw refreshError;
    }

    try {
      const result = await operation(new MercadoPagoOrderProvider(refreshed.access_token));
      await recordHealthy(storeId);
      return result;
    } catch (retryError) {
      await recordProviderError(storeId, retryError);
      throw retryError;
    }
  }
}

function pagBankNotificationUrl(storeId: string, secret: string) {
  const base = normalizeAppUrl(process.env.APP_URL, "https://www.pedeaqui.pp.ua");
  return `${base}/api/webhooks/payments/pagbank/${storeId}?token=${encodeURIComponent(secret)}`;
}

async function withPagBankProvider<T>(
  storeId: string,
  operation: (provider: OrderPaymentProvider) => Promise<T>,
): Promise<T> {
  const credentials = await getUsablePagBankCredentials(storeId);
  const notificationUrl = pagBankNotificationUrl(storeId, credentials.webhook_secret);
  try {
    const result = await operation(new PagBankOrderProvider(credentials.access_token, credentials.environment, { notificationUrl }));
    await recordHealthy(storeId, "pagbank");
    return result;
  } catch (error) {
    const authRejected = error instanceof PagBankProviderHttpError && (error.status === 401 || error.status === 403);
    if (!authRejected) {
      if (!(error instanceof PagBankProviderHttpError && error.parameter?.startsWith("customer."))) await recordProviderError(storeId, error, undefined, "pagbank");
      throw error;
    }

    let refreshed;
    try {
      refreshed = await forceRefreshPagBankCredentials(storeId);
    } catch (refreshError) {
      await recordProviderError(storeId, refreshError, "pagbank_auth_failed", "pagbank");
      throw refreshError;
    }

    try {
      const result = await operation(new PagBankOrderProvider(refreshed.access_token, refreshed.environment, { notificationUrl }));
      await recordHealthy(storeId, "pagbank");
      return result;
    } catch (retryError) {
      await recordProviderError(storeId, retryError, undefined, "pagbank");
      throw retryError;
    }
  }
}

function withProvider<T>(
  storeId: string,
  providerKey: OrderPaymentProviderKey,
  operation: (provider: OrderPaymentProvider) => Promise<T>,
): Promise<T> {
  if (providerKey === "pagbank") return withPagBankProvider(storeId, operation);
  return withMercadoPagoProvider(storeId, operation);
}

async function updateFromProvider(charge: ChargeRow, remote: OnlinePixProviderOrder) {
  assertProviderMatches(charge, remote);
  const admin = createAdminClient();

  // The PedeAqui ledger remains authoritative. Settle it first: if the provider
  // mirror update fails afterwards, reconciliation can safely retry this RPC.
  if (remote.status === "paid") {
    const { error: confirmError } = await admin.rpc("payment_confirm_internal", {
      p_payment_id: charge.payment_id,
      p_cash_received_cents: null,
      p_reference: remote.providerPaymentId ?? remote.providerOrderId,
      p_actor_user_id: null,
      p_source: "integration",
    });
    if (confirmError) throw confirmError;
  }

  const now = new Date().toISOString();
  const nextStatus = charge.status === "paid" ? "paid" : remote.status;
  const { data, error } = await admin.from("order_payment_provider_charges").update({
    status: nextStatus,
    provider_order_id: remote.providerOrderId,
    provider_payment_id: remote.providerPaymentId,
    // A consulta do PagBank não traz a imagem do QR: mantém a que já foi entregue ao cliente.
    qr_code: remote.qrCode ?? charge.qr_code,
    qr_code_base64: remote.qrCodeBase64 ?? charge.qr_code_base64,
    ticket_url: remote.ticketUrl ?? charge.ticket_url,
    expires_at: safeExpiry(remote.expiresAt),
    last_reconciled_at: now,
    last_error_code: null,
    updated_at: now,
  }).eq("id", charge.id).select("*").single();
  if (error) throw error;

  return data as ChargeRow;
}

export class OrderPixService {
  static async ensureForOrder(orderId: string, options: { payerTaxId?: string | null } = {}): Promise<PublicPixPayment | null> {
    const admin = createAdminClient();
    const { data: order, error: orderError } = await admin.from("orders")
      .select("id, organization_id, store_id, source_cart_id, payment_method_snapshot, payment_status, total_cents, customer_name_snapshot")
      .eq("id", orderId)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order || order.payment_method_snapshot !== "pix") return null;

    const { data: externalPayment, error: externalPaymentError } = await admin.from("external_orders")
      .select("provider, payment_owner")
      .eq("organization_id", order.organization_id)
      .eq("store_id", order.store_id)
      .eq("order_id", order.id)
      .maybeSingle();
    if (externalPaymentError) throw externalPaymentError;
    if (!resolveExternalPaymentPolicy(externalPayment).allowsOnlinePix) return null;

    const providerKey = await OrderPaymentProviderConfigService.activeProvider(order.organization_id, order.store_id);
    if (!providerKey) return null;

    const { data: payment, error: paymentError } = await admin.from("payments")
      .select("id, status, amount_cents")
      .eq("organization_id", order.organization_id)
      .eq("store_id", order.store_id)
      .eq("order_id", order.id)
      .eq("method", "pix")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (paymentError) throw paymentError;
    if (!payment) throw new Error("PIX payment intent was not created");

    const { data: existing, error: existingError } = await admin.from("order_payment_provider_charges")
      .select("*")
      .eq("payment_id", payment.id)
      .order("attempt", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingError) throw existingError;
    if (payment.status === "paid") {
      if (!existing) return null;
      const projected = publicProjection(existing as ChargeRow);
      return projected.status === "paid" ? projected : { ...projected, status: "paid" };
    }
    if (existing && existing.status === "pending" && existing.provider_order_id) return publicProjection(existing as ChargeRow);
    if (existing && existing.status === "paid") return publicProjection(existing as ChargeRow);

    let email: string | null = null;
    if (order.source_cart_id) {
      const { data: checkout, error: checkoutError } = await admin.from("checkout_sessions")
        .select("customer_email")
        .eq("organization_id", order.organization_id)
        .eq("store_id", order.store_id)
        .eq("cart_id", order.source_cart_id)
        .maybeSingle();
      if (checkoutError) throw checkoutError;
      email = checkout?.customer_email ?? null;
    }
    if (!email) throw new Error("E-mail do cliente é obrigatório para gerar o PIX online");

    // O PagBank exige o CPF do pagador. Ele vem do formulário da página do pedido,
    // segue só para o PagBank e não é gravado no PedeAqui.
    const payerTaxId = onlyDigits(options.payerTaxId);
    if (providerKey === "pagbank" && !isValidCpf(payerTaxId)) {
      return { status: "needs_document", amountCents: Number(payment.amount_cents), qrCode: null, qrCodeBase64: null, ticketUrl: null, expiresAt: null };
    }

    const { data: reserved, error: reserveError } = await admin.rpc("order_payment_provider_reserve_charge_internal", {
      p_payment_id: payment.id,
      p_provider: providerKey,
    });
    if (reserveError) throw reserveError;
    let charge = reserved as ChargeRow;
    if (charge.status === "pending" && charge.provider_order_id) return publicProjection(charge);
    if (charge.provider !== providerKey && !charge.provider_order_id) {
      // A unidade trocou de provedor antes de a cobrança anterior chegar a ele.
      const { data: moved, error: moveError } = await admin.from("order_payment_provider_charges")
        .update({ provider: providerKey, updated_at: new Date().toISOString() })
        .eq("id", charge.id)
        .is("provider_order_id", null)
        .select("*")
        .single();
      if (moveError) throw moveError;
      charge = moved as ChargeRow;
    }

    const request = {
      amountCents: Number(charge.amount_cents),
      currency: "BRL" as const,
      externalReference: charge.external_reference,
      idempotencyKey: charge.idempotency_key,
      payerEmail: email,
      payerName: order.customer_name_snapshot ?? null,
      payerTaxId: charge.provider === "pagbank" ? payerTaxId : null,
    };
    if (charge.provider === "pagbank") {
      // Um CPF corrigido precisa de outra chave: a mesma chave devolveria a recusa anterior.
      request.idempotencyKey = `${charge.idempotency_key}-${createHash("sha256").update(payerTaxId).digest("hex").slice(0, 12)}`;
    }

    try {
      // If an OAuth token is rejected, the provider wrapper refreshes it once
      // and retries this exact request, preserving the idempotency key.
      const remote = await withProvider(order.store_id, charge.provider, (provider) => provider.createPixCharge(request));
      return publicProjection(await updateFromProvider(charge, remote));
    } catch (error) {
      await admin.from("order_payment_provider_charges").update({
        last_error_code: "provider_request_failed",
        updated_at: new Date().toISOString(),
      }).eq("id", charge.id);
      if (error instanceof PagBankProviderHttpError && error.parameter?.startsWith("customer.tax_id")) throw new PixPayerDocumentError();
      throw error;
    }
  }

  static async reconcile(storeId: string, providerOrderId: string, providerKey: OrderPaymentProviderKey = "mercado_pago"): Promise<PublicPixPayment | null> {
    const admin = createAdminClient();
    const remote = await withProvider(storeId, providerKey, (provider) => provider.getOrder(providerOrderId));

    const { data: direct, error: directError } = await admin.from("order_payment_provider_charges")
      .select("*")
      .eq("store_id", storeId)
      .eq("provider", providerKey)
      .eq("provider_order_id", providerOrderId)
      .maybeSingle();
    if (directError) throw directError;

    let charge = direct as ChargeRow | null;
    if (!charge) {
      const { data: referenced, error: referenceError } = await admin.from("order_payment_provider_charges")
        .select("*")
        .eq("store_id", storeId)
        .eq("provider", providerKey)
        .eq("external_reference", remote.externalReference)
        .maybeSingle();
      if (referenceError) throw referenceError;
      charge = referenced as ChargeRow | null;
    }
    if (!charge) return null;

    // Always pass through updateFromProvider, including local paid rows. The
    // provider values are revalidated and ledger confirmation is idempotent.
    return publicProjection(await updateFromProvider(charge, remote));
  }

  static async getExistingForOrder(orderId: string): Promise<PublicPixPayment | null> {
    const admin = createAdminClient();
    const { data, error } = await admin.from("order_payment_provider_charges")
      .select("*")
      .eq("order_id", orderId)
      .order("attempt", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data ? publicProjection(data as ChargeRow) : null;
  }
}
