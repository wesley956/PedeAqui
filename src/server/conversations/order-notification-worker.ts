import "server-only";

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  buildOrderNotificationBody,
  buildOrderNotificationTemplateParameters,
  buildOrderTrackingUrl,
  buildPublicMenuUrl,
  notificationClientMessageId,
  retryDelaySeconds,
  type OrderNotificationType,
} from "@/server/conversations/order-notification-model";
import { normalizeOrderNotificationCustomTemplates } from "@/server/conversations/order-notification-template";
import {
  automationCanDispatch,
  resolveWhatsAppAutomationCapabilities,
  type WhatsAppAutomationCapability,
} from "@/server/conversations/whatsapp-automation-capability";
import { WhatsAppAutomationCapabilityService } from "@/server/conversations/whatsapp-automation-capability-service";
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

const CUSTOMER_SUPPORT_WINDOW_MS = 23 * 60 * 60 * 1000 + 50 * 60 * 1000;

function safeError(error: unknown) {
  if (error instanceof WhatsAppProviderError) {
    return {
      code: error.providerCode ? `provider_${error.providerCode}` : `provider_http_${error.status}`,
      message: error.retryable ? "A Meta está temporariamente indisponível." : "A Meta rejeitou o envio. Revise a conexão do WhatsApp ou o modelo aprovado.",
    };
  }
  return { code: "notification_error", message: "Não foi possível enviar a notificação do pedido." };
}

function hasCustomerSupportWindow(createdAt: string | null | undefined) {
  if (!createdAt) return false;
  const timestamp = Date.parse(createdAt);
  if (!Number.isFinite(timestamp)) return false;
  const age = Date.now() - timestamp;
  return age >= 0 && age <= CUSTOMER_SUPPORT_WINDOW_MS;
}

function capabilityErrorCode(capability: WhatsAppAutomationCapability) {
  switch (capability.state) {
    case "available_disabled": return "notification_disabled";
    case "suspended_module": return "automation_suspended_module";
    case "suspended_entitlement": return "automation_suspended_entitlement";
    case "suspended_channel": return "automation_suspended_channel";
    case "unavailable_profile": return "automation_unavailable_profile";
    case "invalid_configuration": return "automation_invalid_configuration";
    case "enabled": return null;
  }
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

  const [settingsResult, storeResult, contextResult, customerResult, structural] = await Promise.all([
    admin.from("store_conversation_settings")
      .select("whatsapp_enabled, connection_status, whatsapp_phone_number_id, access_token_secret_ref, app_secret_secret_ref, order_notifications_enabled, order_notification_preset, notify_order_received, notify_order_confirmed, notify_production_preparing, notify_payment_paid, notify_pickup_ready, notify_pickup_completed, notify_out_for_delivery, notify_delivered, notify_order_canceled, order_notification_custom_templates, order_notification_template_name, order_notification_template_language")
      .eq("organization_id", job.organization_id).eq("store_id", job.store_id).maybeSingle(),
    admin.from("stores").select("name, slug, status")
      .eq("organization_id", job.organization_id).eq("id", job.store_id).maybeSingle(),
    admin.from("order_notification_contexts").select("tracking_access_token")
      .eq("organization_id", job.organization_id).eq("store_id", job.store_id).eq("order_id", job.order_id).maybeSingle(),
    order.customer_id
      ? admin.from("customers").select("phone_normalized").eq("organization_id", job.organization_id).eq("id", order.customer_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    WhatsAppAutomationCapabilityService.loadForStore(job.organization_id, job.store_id),
  ]);
  if (settingsResult.error) throw settingsResult.error;
  if (storeResult.error) throw storeResult.error;
  if (contextResult.error) throw contextResult.error;
  if (customerResult.error) throw customerResult.error;

  const settings = settingsResult.data;
  const store = storeResult.data;
  const context = contextResult.data;
  const customer = customerResult.data;

  if (!settings) {
    await finish({ notificationId: job.id, workerId, status: "skipped", errorCode: "notification_disabled", errorMessage: "Automações do WhatsApp não estão configuradas para esta unidade." });
    return "skipped" as const;
  }

  const preferences = {
    order_received: Boolean(settings.notify_order_received),
    order_confirmed: Boolean(settings.notify_order_confirmed),
    production_preparing: Boolean(settings.notify_production_preparing),
    payment_paid: Boolean(settings.notify_payment_paid),
    pickup_ready: Boolean(settings.notify_pickup_ready),
    pickup_completed: Boolean(settings.notify_pickup_completed),
    out_for_delivery: Boolean(settings.notify_out_for_delivery),
    delivered: Boolean(settings.notify_delivered),
    order_canceled: Boolean(settings.notify_order_canceled),
  } as const;
  const capabilities = resolveWhatsAppAutomationCapabilities({
    businessType: structural.businessType,
    modules: structural.modules,
    channel: {
      configured: Boolean(settings.whatsapp_phone_number_id && settings.access_token_secret_ref && settings.app_secret_secret_ref),
      enabled: Boolean(settings.whatsapp_enabled),
      connectionStatus: settings.connection_status,
    },
    orderNotificationsEnabled: Boolean(settings.order_notifications_enabled),
    preferences,
    onlinePaymentReady: structural.onlinePaymentReady,
    deliveryOperationEnabled: structural.deliveryOperationEnabled,
  });
  const capability = capabilities[job.notification_type];

  if (!automationCanDispatch(capability)) {
    if (capability.state === "suspended_channel" && settings.connection_status === "temporarily_unavailable") {
      await finish({
        notificationId: job.id,
        workerId,
        status: "failed",
        errorCode: "whatsapp_temporarily_unavailable",
        errorMessage: capability.reason ?? "O WhatsApp está temporariamente indisponível.",
        retryAfterSeconds: retryDelaySeconds(job.attempts),
      });
      return "failed" as const;
    }
    await finish({
      notificationId: job.id,
      workerId,
      status: "skipped",
      errorCode: capabilityErrorCode(capability),
      errorMessage: capability.reason ?? "Notificação desativada para esta unidade.",
    });
    return "skipped" as const;
  }

  if (job.notification_type === "order_canceled") {
    if (order.order_status !== "canceled") {
      await finish({ notificationId: job.id, workerId, status: "skipped", errorCode: "cancel_state_mismatch", errorMessage: "O cancelamento autoritativo não corresponde ao estado atual do pedido." });
      return "skipped" as const;
    }
  } else if (order.order_status === "canceled" || order.order_status === "rejected") {
    await finish({ notificationId: job.id, workerId, status: "skipped", errorCode: "order_terminal_problem", errorMessage: "Pedido cancelado ou rejeitado antes do envio." });
    return "skipped" as const;
  }
  if ((job.notification_type === "pickup_ready" || job.notification_type === "pickup_completed") && order.fulfillment_type !== "pickup") {
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
    await finish({ notificationId: job.id, workerId, status: "skipped", errorCode: "whatsapp_not_configured", errorMessage: "A conexão do WhatsApp precisa ser revisada. O pedido continua normalmente." });
    return "skipped" as const;
  }

  const appUrl = process.env.APP_URL;
  if (!appUrl) {
    await finish({ notificationId: job.id, workerId, status: "failed", errorCode: "app_url_missing", errorMessage: "Endereço público do PedeAqui não configurado.", retryAfterSeconds: 1800 });
    return "failed" as const;
  }

  const trackingUrl = buildOrderTrackingUrl(appUrl, store.slug, order.id, context.tracking_access_token);
  const menuUrl = buildPublicMenuUrl(appUrl, store.slug);
  const customTemplates = normalizeOrderNotificationCustomTemplates(settings.order_notification_custom_templates);
  const messageInput = {
    type: job.notification_type,
    storeName: store.name,
    displayNumber: Number(order.display_number),
    trackingUrl,
    menuUrl,
    customerName: order.customer_name_snapshot,
    customTemplate: customTemplates[job.notification_type] ?? null,
  };
  const body = buildOrderNotificationBody(messageInput);

  const { data: resolved, error: resolveError } = await admin.rpc("conversation_resolve_outbound_internal", {
    p_store_id: job.store_id,
    p_phone_normalized: customer.phone_normalized,
    p_contact_name: order.customer_name_snapshot,
    p_customer_id: order.customer_id,
  });
  if (resolveError) throw resolveError;
  const conversation = resolved as ResolvedConversation | null;
  if (!conversation?.conversation_id || !conversation.external_id) throw new Error("Outbound conversation resolution failed");

  const { data: lastInbound, error: lastInboundError } = await admin.from("messages")
    .select("created_at")
    .eq("organization_id", job.organization_id)
    .eq("store_id", job.store_id)
    .eq("conversation_id", conversation.conversation_id)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastInboundError) throw lastInboundError;
  const canSendFreeForm = hasCustomerSupportWindow(lastInbound?.created_at);

  if (!canSendFreeForm && !settings.order_notification_template_name) {
    await finish({
      notificationId: job.id,
      workerId,
      status: "skipped",
      errorCode: "template_required",
      errorMessage: "Aviso não enviado porque a Meta exige um modelo aprovado fora da janela de atendimento.",
    });
    return "skipped" as const;
  }

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
    const sent = canSendFreeForm
      ? await provider.sendText({ phoneNumberId: settings.whatsapp_phone_number_id, recipient: conversation.external_id, body })
      : await provider.sendTemplate({
          phoneNumberId: settings.whatsapp_phone_number_id,
          recipient: conversation.external_id,
          templateName: settings.order_notification_template_name!,
          languageCode: settings.order_notification_template_language || "pt_BR",
          bodyParameters: buildOrderNotificationTemplateParameters(messageInput),
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
    const retryable = error instanceof WhatsAppProviderError && error.retryable;
    await finish({
      notificationId: job.id,
      workerId,
      status: retryable ? "failed" : "skipped",
      messageId: pending.id,
      errorCode: safe.code,
      errorMessage: safe.message,
      retryAfterSeconds: retryable ? retryDelaySeconds(job.attempts) : null,
    });
    recordFailure("whatsapp.order_notification.send_failed", error, {
      requestId: workerId,
      organizationId: job.organization_id,
      storeId: job.store_id,
      orderId: job.order_id,
      notificationType: job.notification_type,
    });
    return retryable ? "failed" as const : "skipped" as const;
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
        await finish({ notificationId: job.id, workerId, status: "failed", errorCode: safe.code, errorMessage: safe.message, retryAfterSeconds: retryDelaySeconds(job.attempts) });
      } catch {
        // O lease expira e torna o job recuperável; não bloquear os demais pedidos.
      }
      recordFailure("whatsapp.order_notification.worker_failed", error, {
        requestId: workerId,
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
