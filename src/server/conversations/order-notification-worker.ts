import "server-only";

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildOrderNotificationBody,
  buildOrderTrackingUrl,
  notificationClientMessageId,
  notificationEnabled,
  retryDelaySeconds,
  type OrderNotificationType,
} from "@/server/conversations/order-notification-model";
import { WhatsAppCloudProvider, WhatsAppProviderError, resolveWhatsAppAccessToken } from "@/server/conversations/provider";
import { recordFailure } from "@/server/observability/failure";

type QueueRow = {
  id: string;
  organization_id: string;
  store_id: string;
  order_id: string;
  notification_type: OrderNotificationType;
  attempts: number;
};

type ResolvedConversation = {
  conversation_id?: string;
  contact_id?: string;
  external_id?: string;
};

function safeError(error: unknown) {
  if (error instanceof WhatsAppProviderError) {
    return {
      code: error.providerCode ? `provider_${error.providerCode}` : `provider_http_${error.status}`,
      message: error.retryable ? "A Meta está temporariamente indisponível." : "A Meta rejeitou o envio. Revise a conexão do WhatsApp.",
    };
  }
  return { code: "notification_error", message: "Não foi possível enviar a notificação do pedido." };
}

async function finish(input: {
  notificationId: string;
  workerId: string;
  status: "sent" | "failed" | "skipped";
  messageId?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  retryAfterSeconds?: number | null;
}) {
  const admin = createAdminClient();
  const { error } = await admin.rpc("order_notification_finish_internal", {
    p_notification_id: input.notificationId,
    p_worker_id: input.workerId,
    p_status: input.status,
    p_message_id: input.messageId ?? null,
    p_error_code: input.errorCode ?? null,
    p_error_message: input.errorMessage ?? null,
    p_retry_after_seconds: input.retryAfterSeconds ?? null,
  });
  if (error) throw error;
}

async function processOne(job: QueueRow, workerId: string) {
  const admin = createAdminClient();
  const { data: order, error: orderError } = await admin.from("orders")
    .select("id, organization_id, store_id, display_number, fulfillment_type, order_status, customer_id, customer_name_snapshot")
    .eq("id", job.order_id)
    .eq("organization_id", job.organization_id)
    .eq("store_id", job.store_id)
    .maybeSingle();
  if (orderError) throw orderError;
  if (!order) {
    await finish({ notificationId: job.id, workerId, status: "skipped", errorCode: "order_missing", errorMessage: "Pedido não está mais disponível." });
    return "skipped" as const;
  }

  const [settingsResult, storeResult, contextResult, customerResult] = await Promise.all([
    admin.from("store_conversation_settings")
      .select("whatsapp_enabled, whatsapp_phone_number_id, access_token_secret_ref, order_notifications_enabled, notify_order_received, notify_payment_paid, notify_pickup_ready, notify_out_for_delivery, notify_delivered")
      .eq("organization_id", job.organization_id).eq("store_id", job.store_id).maybeSingle(),
    admin.from("stores").select("name, slug, status")
      .eq("organization_id", job.organization_id).eq("id", job.store_id).maybeSingle(),
    admin.from("order_notification_contexts").select("tracking_access_token")
      .eq("organization_id", job.organization_id).eq("store_id", job.store_id).eq("order_id", job.order_id).maybeSingle(),
    order.customer_id
      ? admin.from("customers").select("phone_normalized").eq("organization_id", job.organization_id).eq("id", order.customer_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  if (settingsResult.error) throw settingsResult.error;
  if (storeResult.error) throw storeResult.error;
  if (contextResult.error) throw contextResult.error;
  if (customerResult.error) throw customerResult.error;

  const settings = settingsResult.data;
  const store = storeResult.data;
  const context = contextResult.data;
  const customer = customerResult.data;

  if (!settings || !notificationEnabled(settings, job.notification_type)) {
    await finish({ notificationId: job.id, workerId, status: "skipped", errorCode: "notification_disabled", errorMessage: "Notificação desativada para esta unidade." });
    return "skipped" as const;
  }
  if (!settings.whatsapp_enabled) {
    await finish({ notificationId: job.id, workerId, status: "skipped", errorCode: "whatsapp_disabled", errorMessage: "WhatsApp desativado para esta unidade." });
    return "skipped" as const;
  }
  if (order.order_status === "canceled" || order.order_status === "rejected") {
    await finish({ notificationId: job.id, workerId, status: "skipped", errorCode: "order_terminal_problem", errorMessage: "Pedido cancelado ou rejeitado antes do envio." });
    return "skipped" as const;
  }
  if (job.notification_type === "pickup_ready" && order.fulfillment_type !== "pickup") {
    await finish({ notificationId: job.id, workerId, status: "skipped", errorCode: "not_pickup", errorMessage: "Notificação não se aplica à modalidade do pedido." });
    return "skipped" as const;
  }
  if ((job.notification_type === "out_for_delivery" || job.notification_type === "delivered") && order.fulfillment_type !== "delivery") {
    await finish({ notificationId: job.id, workerId, status: "skipped", errorCode: "not_delivery", errorMessage: "Notificação não se aplica à modalidade do pedido." });
    return "skipped" as const;
  }
  if (!customer?.phone_normalized) {
    await finish({ notificationId: job.id, workerId, status: "skipped", errorCode: "customer_phone_missing", errorMessage: "Cliente sem telefone utilizável para WhatsApp." });
    return "skipped" as const;
  }
  if (!store?.name || !store.slug || store.status !== "active") {
    await finish({ notificationId: job.id, workerId, status: "failed", errorCode: "store_unavailable", errorMessage: "Unidade indisponível para montar a mensagem.", retryAfterSeconds: retryDelaySeconds(job.attempts) });
    return "failed" as const;
  }
  if (!context?.tracking_access_token) {
    await finish({ notificationId: job.id, workerId, status: "failed", errorCode: "tracking_context_missing", errorMessage: "Contexto seguro do acompanhamento ainda não está disponível.", retryAfterSeconds: retryDelaySeconds(job.attempts) });
    return "failed" as const;
  }
  if (!settings.whatsapp_phone_number_id || !settings.access_token_secret_ref) {
    await finish({ notificationId: job.id, workerId, status: "failed", errorCode: "whatsapp_not_configured", errorMessage: "A conexão do WhatsApp precisa ser revisada.", retryAfterSeconds: Math.max(900, retryDelaySeconds(job.attempts)) });
    return "failed" as const;
  }

  const appUrl = process.env.APP_URL;
  if (!appUrl) {
    await finish({ notificationId: job.id, workerId, status: "failed", errorCode: "app_url_missing", errorMessage: "Endereço público do PedeAqui não configurado.", retryAfterSeconds: 1800 });
    return "failed" as const;
  }

  const trackingUrl = buildOrderTrackingUrl(appUrl, store.slug, order.id, context.tracking_access_token);
  const body = buildOrderNotificationBody({
    type: job.notification_type,
    storeName: store.name,
    displayNumber: Number(order.display_number),
    trackingUrl,
  });

  const { data: resolved, error: resolveError } = await admin.rpc("conversation_resolve_outbound_internal", {
    p_store_id: job.store_id,
    p_phone_normalized: customer.phone_normalized,
    p_contact_name: order.customer_name_snapshot,
    p_customer_id: order.customer_id,
  });
  if (resolveError) throw resolveError;
  const conversation = resolved as ResolvedConversation | null;
  if (!conversation?.conversation_id || !conversation.external_id) throw new Error("Outbound conversation resolution failed");

  const { data: pending, error: pendingError } = await admin.rpc("conversation_create_outbound_internal", {
    p_conversation_id: conversation.conversation_id,
    p_body: body,
    p_client_message_id: notificationClientMessageId(order.id, job.notification_type),
    p_sender_type: "system",
    p_actor_user_id: null,
  });
  if (pendingError) throw pendingError;
  if (!pending?.id) throw new Error("Outbound message was not prepared");

  if (["sent", "delivered", "read"].includes(String(pending.delivery_status))) {
    await finish({ notificationId: job.id, workerId, status: "sent", messageId: pending.id });
    return "sent" as const;
  }

  try {
    const provider = new WhatsAppCloudProvider(resolveWhatsAppAccessToken(settings.access_token_secret_ref));
    const sent = await provider.sendText({
      phoneNumberId: settings.whatsapp_phone_number_id,
      recipient: conversation.external_id,
      body,
    });
    const { error: markError } = await admin.rpc("conversation_mark_outbound_result_internal", {
      p_message_id: pending.id,
      p_external_message_id: sent.externalMessageId,
      p_status: "sent",
      p_error_code: null,
      p_error_message: null,
    });
    if (markError) throw markError;
    await finish({ notificationId: job.id, workerId, status: "sent", messageId: pending.id });
    return "sent" as const;
  } catch (error) {
    const safe = safeError(error);
    await admin.rpc("conversation_mark_outbound_result_internal", {
      p_message_id: pending.id,
      p_external_message_id: null,
      p_status: "failed",
      p_error_code: safe.code,
      p_error_message: safe.message,
    });
    await finish({
      notificationId: job.id,
      workerId,
      status: "failed",
      messageId: pending.id,
      errorCode: safe.code,
      errorMessage: safe.message,
      retryAfterSeconds: retryDelaySeconds(job.attempts),
    });
    recordFailure("whatsapp.order_notification.send_failed", error, {
      organizationId: job.organization_id,
      storeId: job.store_id,
      orderId: job.order_id,
      notificationType: job.notification_type,
    });
    return "failed" as const;
  }
}

export async function runOrderWhatsAppNotificationWorker(options?: { workerId?: string; limit?: number }) {
  const admin = createAdminClient();
  const workerId = options?.workerId ?? `order-whatsapp:${randomUUID()}`;
  const limit = Math.min(Math.max(options?.limit ?? 20, 1), 100);
  const { data, error } = await admin.rpc("order_notification_claim_internal", { p_worker_id: workerId, p_limit: limit });
  if (error) throw error;

  const jobs = (data ?? []) as QueueRow[];
  const result = { claimed: jobs.length, sent: 0, failed: 0, skipped: 0 };
  for (const job of jobs) {
    try {
      const status = await processOne(job, workerId);
      result[status] += 1;
    } catch (error) {
      const safe = safeError(error);
      try {
        await finish({
          notificationId: job.id,
          workerId,
          status: "failed",
          errorCode: safe.code,
          errorMessage: safe.message,
          retryAfterSeconds: retryDelaySeconds(job.attempts),
        });
      } catch {
        // O lease expira e torna o job recuperável; não bloquear os demais pedidos.
      }
      recordFailure("whatsapp.order_notification.worker_failed", error, {
        organizationId: job.organization_id,
        storeId: job.store_id,
        orderId: job.order_id,
        notificationType: job.notification_type,
      });
      result.failed += 1;
    }
  }
  return result;
}
