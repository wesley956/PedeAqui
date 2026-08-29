import "server-only";

import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { OrderPaymentProviderConfigService } from "@/server/payments/order-payment-provider-config-service";
import { OrderPixService } from "@/server/payments/order-pix-service";
import { parseMercadoPagoWebhookMetadata } from "@/server/payments/providers/mercado-pago-webhook-payload";
import { validateMercadoPagoWebhookSignature } from "@/server/payments/providers/mercado-pago-signature";

export class MercadoPagoWebhookAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MercadoPagoWebhookAuthError";
  }
}

export async function processMercadoPagoOrderWebhook(input: {
  storeId: string;
  rawBody: string;
  headers: Headers;
  dataId: string | null;
}) {
  const dataId = input.dataId?.trim();
  if (!dataId) throw new MercadoPagoWebhookAuthError("Mercado Pago webhook signed data id is missing");

  const credentials = await OrderPaymentProviderConfigService.credentials(input.storeId, "mercado_pago");
  if (!credentials?.enabled || !credentials.webhook_secret) throw new Error("Mercado Pago webhook is not configured");

  const xSignature = input.headers.get("x-signature");
  const xRequestId = input.headers.get("x-request-id");
  if (!xSignature || !xRequestId) throw new MercadoPagoWebhookAuthError("Mercado Pago webhook signature headers are missing");
  if (!validateMercadoPagoWebhookSignature({
    xSignature,
    xRequestId,
    dataId,
    secret: credentials.webhook_secret,
  })) throw new MercadoPagoWebhookAuthError("Mercado Pago webhook signature is invalid");

  // Mercado Pago signs the resource id carried in the URL together with x-request-id
  // and the signature timestamp. Treat that signed id as canonical and keep the JSON
  // body as best-effort metadata only. This prevents harmless provider payload shape
  // changes from blocking reconciliation after authentication already succeeded.
  const webhook = parseMercadoPagoWebhookMetadata(input.rawBody);
  const bodyMatchesSignedOrder = !webhook.dataId || webhook.dataId === dataId;
  const providerEventId = bodyMatchesSignedOrder && webhook.eventId
    ? webhook.eventId
    : `request:${xRequestId}`;
  const action = bodyMatchesSignedOrder && webhook.type === "order" && webhook.action
    ? webhook.action
    : "order.notification";

  const admin = createAdminClient();
  const payloadHash = createHash("sha256").update(input.rawBody).digest("hex");
  const eventRow = {
    organization_id: credentials.organization_id,
    store_id: credentials.store_id,
    provider: "mercado_pago",
    provider_event_id: providerEventId,
    provider_order_id: dataId,
    action,
    request_id: xRequestId,
    payload_sha256: payloadHash,
    status: "processing",
  };
  const { data: inserted, error: insertError } = await admin.from("order_payment_provider_events")
    .insert(eventRow)
    .select("id, status")
    .maybeSingle();

  let eventId = inserted?.id ?? null;
  if (insertError) {
    if (insertError.code !== "23505") throw insertError;
    const { data: existing, error: existingError } = await admin.from("order_payment_provider_events")
      .select("id, status")
      .eq("store_id", credentials.store_id)
      .eq("provider", "mercado_pago")
      .eq("provider_event_id", providerEventId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing?.status === "processed") return { duplicate: true, reconciled: true };
    eventId = existing?.id ?? null;
  }

  try {
    const payment = await OrderPixService.reconcile(credentials.store_id, dataId);
    if (!payment) throw new Error("Mercado Pago order is not linked to a PedeAqui PIX intent");
    if (eventId) {
      await admin.from("order_payment_provider_events").update({
        status: "processed",
        processed_at: new Date().toISOString(),
        error_code: null,
      }).eq("id", eventId);
    }
    return { duplicate: false, reconciled: true, paymentStatus: payment.status };
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
