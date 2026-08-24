"use server";

import { revalidatePath } from "next/cache";
import { ConversationSettingsService } from "@/server/conversations/settings-service";
import { DEFAULT_WHATSAPP_GREETING, DEFAULT_WHATSAPP_GREETING_FALLBACK } from "@/server/conversations/greeting";
import {
  normalizeWhatsAppAutomationPreset,
  resolveOrderNotificationSelection,
} from "@/server/conversations/order-notification-model";
import { ModuleAccessService } from "@/server/modules/module-access-service";

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
  const [current, modules] = await Promise.all([
    ConversationSettingsService.load(),
    ModuleAccessService.load(),
  ]);
  const greeting = optional(formData, "greetingTemplate");
  const preset = normalizeWhatsAppAutomationPreset(formData.get("orderNotificationPreset") ?? current?.order_notification_preset);
  const productionAvailable = modules.availability.production.available;
  const deliveriesAvailable = modules.availability.deliveries.available;

  const selected = resolveOrderNotificationSelection(preset, {
    notifyOrderReceived: checked(formData, "notifyOrderReceived"),
    notifyOrderConfirmed: checked(formData, "notifyOrderConfirmed"),
    notifyProductionPreparing: checked(formData, "notifyProductionPreparing"),
    notifyPaymentPaid: checked(formData, "notifyPaymentPaid"),
    notifyPickupReady: checked(formData, "notifyPickupReady"),
    notifyPickupCompleted: checked(formData, "notifyPickupCompleted"),
    notifyOutForDelivery: checked(formData, "notifyOutForDelivery"),
    notifyDelivered: checked(formData, "notifyDelivered"),
  });

  await ConversationSettingsService.save({
    whatsappEnabled: checked(formData, "whatsappEnabled"),
    phoneNumberId: current?.whatsapp_phone_number_id ?? null,
    businessAccountId: current?.whatsapp_business_account_id ?? null,
    accessTokenSecretRef: current?.access_token_secret_ref ?? null,
    appSecretSecretRef: current?.app_secret_secret_ref ?? null,
    botEnabled: checked(formData, "botEnabled"),
    aiEnabled: checked(formData, "aiEnabled"),
    greetingEnabled: checked(formData, "greetingEnabled"),
    greetingTemplate: greeting ? restoreGreetingTokens(greeting) : DEFAULT_WHATSAPP_GREETING,
    greetingFallbackMessage: optional(formData, "greetingFallbackMessage") ?? DEFAULT_WHATSAPP_GREETING_FALLBACK,
    orderNotificationsEnabled: checked(formData, "orderNotificationsEnabled"),
    orderNotificationPreset: preset,
    notifyOrderReceived: selected.notifyOrderReceived,
    notifyOrderConfirmed: selected.notifyOrderConfirmed,
    notifyProductionPreparing: productionAvailable && selected.notifyProductionPreparing,
    notifyPaymentPaid: selected.notifyPaymentPaid,
    notifyPickupReady: productionAvailable && selected.notifyPickupReady,
    notifyPickupCompleted: selected.notifyPickupCompleted,
    notifyOutForDelivery: deliveriesAvailable && selected.notifyOutForDelivery,
    notifyDelivered: deliveriesAvailable && selected.notifyDelivered,
    orderNotificationTemplateName: optional(formData, "orderNotificationTemplateName") ?? current?.order_notification_template_name ?? null,
    orderNotificationTemplateLanguage: optional(formData, "orderNotificationTemplateLanguage") ?? current?.order_notification_template_language ?? "pt_BR",
  });
  revalidatePath("/configuracoes/conversas");
  revalidatePath("/conversas");
}
