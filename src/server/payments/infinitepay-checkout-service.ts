import "server-only";

import { normalizeAppUrl } from "@/lib/app-url";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ChargeRow } from "@/server/payments/order-pix-service";
import { OrderPaymentProviderConfigService } from "@/server/payments/order-payment-provider-config-service";
import { InfinitePayCheckoutProvider, InfinitePayHttpError, type InfinitePayNotification } from "@/server/payments/providers/infinitepay-checkout-provider";

async function credentialsFor(storeId: string, allowDisconnected = false) {
  const credentials = await OrderPaymentProviderConfigService.credentials(storeId, "infinitepay");
  if (!credentials || (!allowDisconnected && credentials.revoked_at) || !credentials.provider_account_id || credentials.environment !== "production") {
    throw new Error("InfinitePay is not connected");
  }
  return credentials;
}

export class InfinitePayCheckoutService {
  static async create(charge: ChargeRow, customer: { email: string; name?: string | null }): Promise<ChargeRow> {
    const credentials = await credentialsFor(charge.store_id);
    if (!credentials.enabled) throw new Error("InfinitePay is not enabled");
    const admin = createAdminClient();
    const { data: store, error: storeError } = await admin.from("stores").select("slug")
      .eq("id", charge.store_id).eq("organization_id", charge.organization_id).single();
    if (storeError) throw storeError;

    // The provider does not document an idempotency header. Claim once in the
    // database BEFORE sending. An ambiguous timeout must never create a second link.
    const startedAt = new Date().toISOString();
    const { data: claimed, error: claimError } = await admin.from("order_payment_provider_charges")
      .update({ checkout_creation_started_at: startedAt, updated_at: startedAt })
      .eq("id", charge.id).eq("provider", "infinitepay").eq("status", "creating")
      .is("checkout_creation_started_at", null).select("*").maybeSingle();
    if (claimError) throw claimError;
    if (!claimed) {
      const { data, error } = await admin.from("order_payment_provider_charges").select("*").eq("id", charge.id).single();
      if (error) throw error;
      return data as ChargeRow;
    }

    try {
      const base = normalizeAppUrl(process.env.APP_URL, "https://www.pedeaqui.pp.ua");
      const orderPath = `/m/${encodeURIComponent(store.slug)}/pedido/${charge.order_id}`;
      const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
      const provider = new InfinitePayCheckoutProvider(credentials.access_token, credentials.provider_account_id!);
      const ticketUrl = await provider.createCheckout({
        reference: charge.external_reference,
        amountCents: Number(charge.amount_cents),
        email: customer.email,
        name: customer.name,
        webhookUrl: `${base}/api/webhooks/payments/infinitepay/${charge.store_id}?token=${encodeURIComponent(credentials.webhook_secret)}`,
        redirectUrl: `${base}${orderPath}/infinitepay/retorno`,
        expiresAt,
      });
      const { data, error } = await admin.from("order_payment_provider_charges")
        .update({ status: "pending", ticket_url: ticketUrl, expires_at: expiresAt, last_error_code: null, updated_at: new Date().toISOString() })
        .eq("id", charge.id).eq("status", "creating").select("*").maybeSingle();
      if (error) throw error;
      // A webhook may settle the same charge while link creation is finishing.
      if (!data) {
        const current = await admin.from("order_payment_provider_charges").select("*").eq("id", charge.id).single();
        if (current.error) throw current.error;
        return current.data as ChargeRow;
      }
      await OrderPaymentProviderConfigService.recordHealth(charge.store_id, { status: "healthy" }, "infinitepay").catch(() => undefined);
      return data as ChargeRow;
    } catch (error) {
      // Only a definitive rejection is safe to retry. A network timeout may have
      // already created a payable link; keep the claim for manual investigation.
      const rejected = error instanceof InfinitePayHttpError && [400, 401, 403, 422].includes(error.status);
      await admin.from("order_payment_provider_charges").update({
        ...(rejected ? { checkout_creation_started_at: null } : {}),
        last_error_code: rejected ? "provider_request_failed" : "checkout_creation_uncertain",
        updated_at: new Date().toISOString(),
      }).eq("id", charge.id).eq("status", "creating");
      await OrderPaymentProviderConfigService.recordHealth(charge.store_id, {
        status: "error",
        errorCode: error instanceof InfinitePayHttpError && [401, 403].includes(error.status)
          ? "infinitepay_auth_failed" : "infinitepay_request_failed",
      }, "infinitepay").catch(() => undefined);
      throw error;
    }
  }

  static async reconcile(storeId: string, notification: InfinitePayNotification, expectedOrderId?: string) {
    const admin = createAdminClient();
    const { data: charge, error } = await admin.from("order_payment_provider_charges").select("*")
      .eq("store_id", storeId).eq("provider", "infinitepay")
      .eq("external_reference", notification.order_nsu).maybeSingle();
    if (error) throw error;
    if (!charge || (expectedOrderId && charge.order_id !== expectedOrderId)) throw new Error("InfinitePay charge not found");
    if (charge.status === "paid" && charge.provider_payment_id && charge.provider_payment_id !== notification.transaction_nsu) throw new Error("InfinitePay transaction mismatch");
    if (charge.provider_order_id && charge.provider_order_id !== notification.invoice_slug) throw new Error("InfinitePay invoice mismatch");

    const credentials = await credentialsFor(storeId, true);
    const provider = new InfinitePayCheckoutProvider(credentials.access_token, credentials.provider_account_id!);
    const remote = await provider.checkPayment(notification);
    if (remote.amount !== Number(charge.amount_cents)) throw new Error("InfinitePay amount mismatch");
    // Store identifiers only after a successful authenticated provider lookup.
    // This also lets scheduled reconciliation recover a verified pending payment.
    if (!remote.paid) {
      const { error: pendingError } = await admin.from("order_payment_provider_charges").update({
        provider_order_id: notification.invoice_slug,
        provider_payment_id: notification.transaction_nsu,
        last_reconciled_at: new Date().toISOString(),
      }).eq("id", charge.id).neq("status", "paid");
      if (pendingError) throw pendingError;
      return { paid: false };
    }
    const { error: confirmError } = await admin.rpc("order_payment_provider_infinitepay_confirm_internal", {
      p_charge_id: charge.id,
      p_store_id: storeId,
      p_amount_cents: remote.amount,
      p_method: remote.capture_method,
      p_transaction_nsu: notification.transaction_nsu,
      p_invoice_slug: notification.invoice_slug,
    });
    if (confirmError) throw confirmError;
    await OrderPaymentProviderConfigService.recordHealth(storeId, { status: "healthy" }, "infinitepay").catch(() => undefined);
    return { paid: true };
  }
}
