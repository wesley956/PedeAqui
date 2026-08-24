export const WHATSAPP_CONNECTION_MODES = ["coexistence", "cloud_api"] as const;
export type WhatsAppConnectionMode = (typeof WHATSAPP_CONNECTION_MODES)[number];

export type MetaEmbeddedSignupResult = {
  mode: WhatsAppConnectionMode;
  wabaId: string;
  phoneNumberId: string | null;
  businessId: string | null;
};

const META_ID = /^\d{3,40}$/;

export function isWhatsAppConnectionMode(value: unknown): value is WhatsAppConnectionMode {
  return value === "coexistence" || value === "cloud_api";
}

export function embeddedSignupFeatureType(mode: WhatsAppConnectionMode) {
  return mode === "coexistence" ? "whatsapp_business_app_onboarding" : "";
}

export function embeddedSignupSuccessEvent(event: unknown) {
  return event === "FINISH" || event === "FINISH_ONLY_WABA" || event === "FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING";
}

export function parseEmbeddedSignupResult(payload: unknown, mode: WhatsAppConnectionMode): MetaEmbeddedSignupResult | null {
  if (!payload || typeof payload !== "object") return null;
  const value = payload as { type?: unknown; event?: unknown; data?: Record<string, unknown> };
  if (value.type !== "WA_EMBEDDED_SIGNUP" || !embeddedSignupSuccessEvent(value.event)) return null;

  const wabaId = String(value.data?.waba_id ?? "");
  if (!META_ID.test(wabaId)) return null;

  const rawPhoneNumberId = value.data?.phone_number_id;
  const phoneNumberId = rawPhoneNumberId != null && META_ID.test(String(rawPhoneNumberId)) ? String(rawPhoneNumberId) : null;
  const rawBusinessId = value.data?.business_id ?? value.data?.business_manager_id;
  const businessId = rawBusinessId != null && META_ID.test(String(rawBusinessId)) ? String(rawBusinessId) : null;

  return { mode, wabaId, phoneNumberId, businessId };
}
