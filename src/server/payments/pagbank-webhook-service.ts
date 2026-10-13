import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { OrderPaymentProviderConfigService } from "@/server/payments/order-payment-provider-config-service";
import { OrderPixService } from "@/server/payments/order-pix-service";
import { parsePagBankNotificationOrderId } from "@/server/payments/providers/pagbank-order-provider";

export class PagBankWebhookAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PagBankWebhookAuthError";
  }
}

function sameSecret(supplied: string, expected: string) {
  const a = createHash("sha256").update(supplied).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Notificação do PagBank para o Pix do pedido.
 * A URL de cada unidade leva um token aleatório guardado no Vault; só o PagBank a conhece,
 * porque ela vai em notification_urls no pedido criado pelo servidor. Mesmo autenticada,
 * a notificação só serve de gatilho: o PedeAqui consulta o pedido no PagBank e valida
 * referência, valor e moeda antes de dar baixa.
 */
export async function processPagBankOrderWebhook(input: { storeId: string; rawBody: string; token: string | null }) {
  const credentials = await OrderPaymentProviderConfigService.credentials(input.storeId, "pagbank");
  if (!credentials?.webhook_secret) throw new Error("PagBank webhook is not configured");
  if (!input.token || !sameSecret(input.token, credentials.webhook_secret)) {
    throw new PagBankWebhookAuthError("PagBank notification token is invalid");
  }

  const orderId = parsePagBankNotificationOrderId(input.rawBody);
  if (!orderId) throw new PagBankWebhookAuthError("PagBank notification has no order id");

  const admin = createAdminClient();
  const payloadHash = createHash("sha256").update(input.rawBody).digest("hex");
  const providerEventId = `${orderId}:${payloadHash.slice(0, 32)}`;
  const { data: inserted, error: insertError } = await admin.from("order_payment_provider_events")
    .insert({
      organization_id: credentials.organization_id,
      store_id: credentials.store_id,
      provider: "pagbank",
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
      .eq("provider", "pagbank")
      .eq("provider_event_id", providerEventId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing?.status === "processed") return { duplicate: true, reconciled: true };
    eventId = existing?.id ?? null;
  }

  try {
    const payment = await OrderPixService.reconcile(credentials.store_id, orderId, "pagbank");
    if (!payment) throw new Error("PagBank order is not linked to a PedeAqui PIX intent");
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
