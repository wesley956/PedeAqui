import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { OrderPaymentProviderConfigService } from "@/server/payments/order-payment-provider-config-service";
import { InfinitePayCheckoutService } from "@/server/payments/infinitepay-checkout-service";
import { infinitePayNotificationSchema } from "@/server/payments/providers/infinitepay-checkout-provider";

export class InfinitePayWebhookAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InfinitePayWebhookAuthError";
  }
}

function sameSecret(supplied: string, expected: string) {
  const a = createHash("sha256").update(supplied).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** Token authenticates the callback; payment_check is authoritative for settlement. */
export async function processInfinitePayOrderWebhook(input: { storeId: string; rawBody: string; token: string | null }) {
  const credentials = await OrderPaymentProviderConfigService.credentials(input.storeId, "infinitepay");
  if (!credentials?.webhook_secret) throw new Error("InfinitePay webhook is not configured");
  if (!input.token || !sameSecret(input.token, credentials.webhook_secret)) {
    throw new InfinitePayWebhookAuthError("InfinitePay notification token is invalid");
  }

  let payload: unknown;
  try { payload = JSON.parse(input.rawBody); } catch { throw new InfinitePayWebhookAuthError("Invalid InfinitePay notification"); }
  const parsed = infinitePayNotificationSchema.safeParse(payload);
  if (!parsed.success) throw new InfinitePayWebhookAuthError("Invalid InfinitePay notification");
  const notification = parsed.data;
  const orderId = notification.invoice_slug;

  const admin = createAdminClient();
  const payloadHash = createHash("sha256").update(input.rawBody).digest("hex");
  const providerEventId = createHash("sha256").update(`${notification.order_nsu}:${notification.transaction_nsu}:${orderId}`).digest("hex");
  const { data: inserted, error: insertError } = await admin.from("order_payment_provider_events")
    .insert({
      organization_id: credentials.organization_id,
      store_id: credentials.store_id,
      provider: "infinitepay",
      provider_event_id: providerEventId,
      provider_order_id: orderId,
      action: "order.notification",
      request_id: null,
      payload_sha256: payloadHash,
      status: "processing",
    })
    .select("id, status")
    .maybeSingle();

  let eventId = inserted?.id ?? null;
  if (insertError) {
    if (insertError.code !== "23505") throw insertError;
    const { data: existing, error: existingError } = await admin.from("order_payment_provider_events")
      .select("id, status")
      .eq("store_id", credentials.store_id)
      .eq("provider", "infinitepay")
      .eq("provider_event_id", providerEventId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing?.status === "processed") return { duplicate: true, reconciled: true };
    eventId = existing?.id ?? null;
  }

  try {
    const payment = await InfinitePayCheckoutService.reconcile(credentials.store_id, notification);
    if (!payment.paid) throw new Error("InfinitePay payment is not approved yet");
    if (eventId) {
      await admin.from("order_payment_provider_events").update({
        status: "processed",
        processed_at: new Date().toISOString(),
        error_code: null,
      }).eq("id", eventId);
    }
    return { duplicate: false, reconciled: true, paymentStatus: "paid" };
  } catch (error) {
    if (eventId) {
      await admin.from("order_payment_provider_events").update({
        status: "error",
        error_code: "reconciliation_failed",
        processed_at: new Date().toISOString(),
      }).eq("id", eventId);
    }
    throw error;
  }
}
