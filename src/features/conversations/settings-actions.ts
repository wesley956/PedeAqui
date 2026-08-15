"use server";

import { revalidatePath } from "next/cache";
import { ConversationSettingsService } from "@/server/conversations/settings-service";
import { DEFAULT_WHATSAPP_GREETING, DEFAULT_WHATSAPP_GREETING_FALLBACK } from "@/server/conversations/greeting";

function optional(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

export async function saveConversationSettingsAction(formData: FormData) {
  await ConversationSettingsService.save({
    whatsappEnabled: formData.get("whatsappEnabled") === "on",
    phoneNumberId: optional(formData, "phoneNumberId"),
    businessAccountId: optional(formData, "businessAccountId"),
    accessTokenSecretRef: optional(formData, "accessTokenSecretRef"),
    appSecretSecretRef: optional(formData, "appSecretSecretRef"),
    botEnabled: formData.get("botEnabled") === "on",
    aiEnabled: formData.get("aiEnabled") === "on",
    greetingEnabled: formData.get("greetingEnabled") === "on",
    greetingTemplate: optional(formData, "greetingTemplate") ?? DEFAULT_WHATSAPP_GREETING,
    greetingFallbackMessage: optional(formData, "greetingFallbackMessage") ?? DEFAULT_WHATSAPP_GREETING_FALLBACK,
  });
  revalidatePath("/configuracoes/conversas");
  revalidatePath("/conversas");
}
