"use server";

import { revalidatePath } from "next/cache";
import { ConversationSettingsService } from "@/server/conversations/settings-service";
import { DEFAULT_WHATSAPP_GREETING, DEFAULT_WHATSAPP_GREETING_FALLBACK } from "@/server/conversations/greeting";

function optional(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function restoreGreetingTokens(value: string) {
  return value
    .replaceAll("[nome do restaurante]", "{restaurante}")
    .replaceAll("[link do cardápio]", "{link}");
}

export async function saveConversationSettingsAction(formData: FormData) {
  const current = await ConversationSettingsService.load();
  const greeting = optional(formData, "greetingTemplate");

  await ConversationSettingsService.save({
    whatsappEnabled: formData.get("whatsappEnabled") === "on",
    phoneNumberId: current?.whatsapp_phone_number_id ?? null,
    businessAccountId: current?.whatsapp_business_account_id ?? null,
    accessTokenSecretRef: current?.access_token_secret_ref ?? null,
    appSecretSecretRef: current?.app_secret_secret_ref ?? null,
    botEnabled: formData.get("botEnabled") === "on",
    aiEnabled: formData.get("aiEnabled") === "on",
    greetingEnabled: formData.get("greetingEnabled") === "on",
    greetingTemplate: greeting ? restoreGreetingTokens(greeting) : DEFAULT_WHATSAPP_GREETING,
    greetingFallbackMessage: optional(formData, "greetingFallbackMessage") ?? DEFAULT_WHATSAPP_GREETING_FALLBACK,
    orderNotificationsEnabled: formData.get("orderNotificationsEnabled") === "on",
    notifyOrderReceived: formData.get("notifyOrderReceived") === "on",
    notifyPaymentPaid: formData.get("notifyPaymentPaid") === "on",
    notifyPickupReady: formData.get("notifyPickupReady") === "on",
    notifyOutForDelivery: formData.get("notifyOutForDelivery") === "on",
    notifyDelivered: formData.get("notifyDelivered") === "on",
    orderNotificationTemplateName: optional(formData, "orderNotificationTemplateName") ?? current?.order_notification_template_name ?? null,
    orderNotificationTemplateLanguage: optional(formData, "orderNotificationTemplateLanguage") ?? current?.order_notification_template_language ?? "pt_BR",
  });
  revalidatePath("/configuracoes/conversas");
  revalidatePath("/conversas");
}
