import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  forceRefreshMercadoPagoCredentials,
  getUsableMercadoPagoCredentials,
} from "@/server/payments/mercado-pago-credential-service";
import {
  OrderPaymentProviderConfigService,
  type OrderPaymentProviderHealthErrorCode,
} from "@/server/payments/order-payment-provider-config-service";
import {
  MercadoPagoOrderProvider,
  MercadoPagoProviderHttpError,
} from "@/server/payments/providers/mercado-pago-order-provider";
import type { OnlinePixProviderOrder } from "@/server/payments/providers/order-payment-provider";

type ChargeRow = {
  id: string;
  organization_id: string;
  store_id: string;
  order_id: string;
  payment_id: string;
  provider: "mercado_pago";
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
  status: "preparing" | "waiting" | "paid" | "expired" | "unavailable";
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

function providerHealthErrorCode(error: unknown): OrderPaymentProviderHealthErrorCode {
  if (error instanceof MercadoPagoProviderHttpError) {
    if (error.status === 401 || error.status === 403) return "mercado_pago_auth_failed";
    if (error.status === 429 || error.status >= 500) return "mercado_pago_provider_unavailable";
  }
  return "mercado_pago_request_failed";
}

async function recordHealthy(storeId: string) {
  await OrderPaymentProviderConfigService.recordHealth(storeId, { status: "healthy" }).catch(() => undefined);
}

async function recordProviderError(storeId: string, error: unknown, override?: OrderPaymentProviderHealthErrorCode) {
  await OrderPaymentProviderConfigService.recordHealth(storeId, {
    status: "error",
    errorCode: override ?? providerHealthErrorCode(error),
  }).catch(() => undefined);
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
    qr_code: remote.qrCode,
    qr_code_base64: remote.qrCodeBase64,
    ticket_url: remote.ticketUrl,
    expires_at: safeExpiry(remote.expiresAt),
    last_reconciled_at: now,
    last_error_code: null,
    updated_at: now,
  }).eq("id", charge.id).select("*").single();
  if (error) throw error;

  return data as ChargeRow;
}

export class OrderPixService {
  static async ensureForOrder(orderId: string): Promise<PublicPixPayment | null> {
    const admin = createAdminClient();
    const { data: order, error: orderError } = await admin.from("orders")
      .select("id, organization_id, store_id, source_cart_id, payment_method_snapshot, payment_status, total_cents")
      .eq("id", orderId)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order || order.payment_method_snapshot !== "pix") return null;

    const ready = await OrderPaymentProviderConfigService.isOnlinePixReady(order.organization_id, order.store_id);
    if (!ready) return null;

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

    const { data: reserved, error: reserveError } = await admin.rpc("order_payment_provider_reserve_charge_internal", {
      p_payment_id: payment.id,
      p_provider: "mercado_pago",
    });
    if (reserveError) throw reserveError;
    const charge = reserved as ChargeRow;
    if (charge.status === "pending" && charge.provider_order_id) return publicProjection(charge);

    const request = {
      amountCents: Number(charge.amount_cents),
      currency: "BRL" as const,
      externalReference: charge.external_reference,
      idempotencyKey: charge.idempotency_key,
      payerEmail: email,
    };

    try {
      // If an OAuth token is rejected, withMercadoPagoProvider refreshes it once
      // and retries this exact request, preserving the idempotency key.
      const remote = await withMercadoPagoProvider(order.store_id, (provider) => provider.createPixCharge(request));
      return publicProjection(await updateFromProvider(charge, remote));
    } catch (error) {
      await admin.from("order_payment_provider_charges").update({
        last_error_code: "provider_request_failed",
        updated_at: new Date().toISOString(),
      }).eq("id", charge.id);
      throw error;
    }
  }

  static async reconcile(storeId: string, providerOrderId: string): Promise<PublicPixPayment | null> {
    const admin = createAdminClient();
    const remote = await withMercadoPagoProvider(storeId, (provider) => provider.getOrder(providerOrderId));

    const { data: direct, error: directError } = await admin.from("order_payment_provider_charges")
      .select("*")
      .eq("store_id", storeId)
      .eq("provider", "mercado_pago")
      .eq("provider_order_id", providerOrderId)
      .maybeSingle();
    if (directError) throw directError;

    let charge = direct as ChargeRow | null;
    if (!charge) {
      const { data: referenced, error: referenceError } = await admin.from("order_payment_provider_charges")
        .select("*")
        .eq("store_id", storeId)
        .eq("provider", "mercado_pago")
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
