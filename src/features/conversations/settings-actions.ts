"use server";

import { revalidatePath } from "next/cache";
import { ConversationSettingsService } from "@/server/conversations/settings-service";
import { DEFAULT_WHATSAPP_GREETING, DEFAULT_WHATSAPP_GREETING_FALLBACK } from "@/server/conversations/greeting";
import {
  normalizeWhatsAppAutomationPreset,
  resolveOrderNotificationSelection,
} from "@/server/conversations/order-notification-model";
import {
  ORDER_NOTIFICATION_TYPES,
  defaultOrderNotificationText,
  normalizeOrderNotificationCustomTemplates,
  validateOrderNotificationTextTemplate,
  type OrderNotificationTemplateMap,
} from "@/server/conversations/order-notification-template";
import { resolveWhatsAppAutomationCapabilities } from "@/server/conversations/whatsapp-automation-capability";
import { WhatsAppAutomationCapabilityService } from "@/server/conversations/whatsapp-automation-capability-service";

function optional(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function checked(formData: FormData, key: string) {
  return formData.get(key) === "on";
}

function restoreGreetingTokens(value: string) {
  return value
    .replaceAll("[nome do restaurante]", "{restaurante}")
    .replaceAll("[link do cardápio]", "{link}");
}

export async function saveConversationSettingsAction(formData: FormData) {
  const [current, structural] = await Promise.all([
    ConversationSettingsService.load(),
    WhatsAppAutomationCapabilityService.loadCurrentStore(),
  ]);
  const greeting = optional(formData, "greetingTemplate");
  const preset = normalizeWhatsAppAutomationPreset(formData.get("orderNotificationPreset") ?? current?.order_notification_preset);
  const connectionConfigured = Boolean(current?.whatsapp_phone_number_id && current?.access_token_secret_ref && current?.app_secret_secret_ref);
  const currentPreferences = {
    order_received: current?.notify_order_received ?? true,
    order_confirmed: Boolean(current?.notify_order_confirmed),
    production_preparing: Boolean(current?.notify_production_preparing),
    payment_paid: Boolean(current?.notify_payment_paid),
    pickup_ready: current?.notify_pickup_ready ?? true,
    pickup_completed: Boolean(current?.notify_pickup_completed),
    out_for_delivery: current?.notify_out_for_delivery ?? true,
    delivered: Boolean(current?.notify_delivered),
    order_canceled: Boolean(current?.notify_order_canceled),
  } as const;
  const capabilities = resolveWhatsAppAutomationCapabilities({
    businessType: structural.businessType,
    modules: structural.modules,
    channel: { configured: connectionConfigured, enabled: Boolean(current?.whatsapp_enabled), connectionStatus: null },
    orderNotificationsEnabled: Boolean(current?.order_notifications_enabled),
    preferences: currentPreferences,
    onlinePaymentReady: structural.onlinePaymentReady,
    deliveryOperationEnabled: structural.deliveryOperationEnabled,
  });

  // Campo desabilitado não é enviado pelo browser. Em modo Personalizado preservamos
  // a preferência se a capability estiver suspensa/incompatível; desligar módulo,
  // entitlement, entrega ou pagamento online nunca apaga a escolha anterior.
  const selected = resolveOrderNotificationSelection(preset, {
    notifyOrderReceived: capabilities.order_received.configurable ? checked(formData, "notifyOrderReceived") : currentPreferences.order_received,
    notifyOrderConfirmed: capabilities.order_confirmed.configurable ? checked(formData, "notifyOrderConfirmed") : currentPreferences.order_confirmed,
    notifyProductionPreparing: capabilities.production_preparing.configurable ? checked(formData, "notifyProductionPreparing") : currentPreferences.production_preparing,
    notifyPaymentPaid: capabilities.payment_paid.configurable ? checked(formData, "notifyPaymentPaid") : currentPreferences.payment_paid,
    notifyPickupReady: capabilities.pickup_ready.configurable ? checked(formData, "notifyPickupReady") : currentPreferences.pickup_ready,
    notifyPickupCompleted: capabilities.pickup_completed.configurable ? checked(formData, "notifyPickupCompleted") : currentPreferences.pickup_completed,
    notifyOutForDelivery: capabilities.out_for_delivery.configurable ? checked(formData, "notifyOutForDelivery") : currentPreferences.out_for_delivery,
    notifyDelivered: capabilities.delivered.configurable ? checked(formData, "notifyDelivered") : currentPreferences.delivered,
    notifyOrderCanceled: capabilities.order_canceled.configurable ? checked(formData, "notifyOrderCanceled") : currentPreferences.order_canceled,
  });

  const customTemplates: OrderNotificationTemplateMap = {
    ...normalizeOrderNotificationCustomTemplates(current?.order_notification_custom_templates),
  };
  for (const type of ORDER_NOTIFICATION_TYPES) {
    if (!capabilities[type].configurable) continue;
    const raw = formData.get(`orderNotificationText_${type}`);
    if (typeof raw !== "string") continue;
    const text = raw.trim();
    if (!text || text === defaultOrderNotificationText(type)) {
      delete customTemplates[type];
      continue;
    }
    const validation = validateOrderNotificationTextTemplate(text);
    if (!validation.ok) throw new Error(`${capabilities[type].label}: ${validation.message}`);
    customTemplates[type] = text;
  }

  await ConversationSettingsService.save({
    whatsappEnabled: connectionConfigured ? checked(formData, "whatsappEnabled") : Boolean(current?.whatsapp_enabled),
    phoneNumberId: current?.whatsapp_phone_number_id ?? null,
    businessAccountId: current?.whatsapp_business_account_id ?? null,
    accessTokenSecretRef: current?.access_token_secret_ref ?? null,
    appSecretSecretRef: current?.app_secret_secret_ref ?? null,
    botEnabled: checked(formData, "botEnabled"),
    aiEnabled: checked(formData, "aiEnabled"),
    greetingEnabled: connectionConfigured ? checked(formData, "greetingEnabled") : Boolean(current?.greeting_enabled),
    greetingTemplate: greeting ? restoreGreetingTokens(greeting) : DEFAULT_WHATSAPP_GREETING,
    greetingFallbackMessage: optional(formData, "greetingFallbackMessage") ?? DEFAULT_WHATSAPP_GREETING_FALLBACK,
    orderNotificationsEnabled: connectionConfigured ? checked(formData, "orderNotificationsEnabled") : Boolean(current?.order_notifications_enabled),
    orderNotificationPreset: preset,
    notifyOrderReceived: selected.notifyOrderReceived,
    notifyOrderConfirmed: selected.notifyOrderConfirmed,
    notifyProductionPreparing: selected.notifyProductionPreparing,
    notifyPaymentPaid: selected.notifyPaymentPaid,
    notifyPickupReady: selected.notifyPickupReady,
    notifyPickupCompleted: selected.notifyPickupCompleted,
    notifyOutForDelivery: selected.notifyOutForDelivery,
    notifyDelivered: selected.notifyDelivered,
    notifyOrderCanceled: selected.notifyOrderCanceled,
    orderNotificationCustomTemplates: customTemplates,
    orderNotificationTemplateName: optional(formData, "orderNotificationTemplateName") ?? current?.order_notification_template_name ?? null,
    orderNotificationTemplateLanguage: optional(formData, "orderNotificationTemplateLanguage") ?? current?.order_notification_template_language ?? "pt_BR",
  });
  revalidatePath("/configuracoes/conversas");
  revalidatePath("/conversas");
}
