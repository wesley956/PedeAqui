import "server-only";
import { resolveWhatsAppGraphVersion, type ProviderSendTemplateInput } from "@/server/conversations/provider";

export type BillingDeliveryResult = { state: "sent"; externalMessageId: string; code: null }
  | { state: "rejected" | "unknown"; externalMessageId: null; code: string };

// A network error or malformed success may have happened AFTER Meta accepted it.
// Keep these outcomes out of the existing provider's generic retryable abstraction.
export async function sendOfficialBillingTemplate(input: ProviderSendTemplateInput, token: string): Promise<BillingDeliveryResult> {
  const version = resolveWhatsAppGraphVersion();
  try {
    const response = await fetch(`https://graph.facebook.com/${version}/${encodeURIComponent(input.phoneNumberId)}/messages`, {
      method: "POST", cache: "no-store", signal: AbortSignal.timeout(8_000),
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: input.recipient, type: "template", template: {
        name: input.templateName, language: { code: input.languageCode },
        ...(input.bodyParameters.length ? { components: [{ type: "body", parameters: input.bodyParameters.map(text => ({ type: "text", text })) }] } : {}),
      } }),
    });
    const payload = await response.json().catch(() => null) as { messages?: { id?: string }[]; error?: { code?: number } } | null;
    const id = payload?.messages?.[0]?.id;
    if (response.ok && typeof id === "string" && id.length > 0) return { state: "sent", externalMessageId: id, code: null };
    const confirmedRejection = [400, 401, 403, 404, 422, 429].includes(response.status)
      && typeof payload?.error?.code === "number" && !payload?.messages?.length;
    return { state: confirmedRejection ? "rejected" : "unknown", externalMessageId: null,
      code: `http_${response.status}${typeof payload?.error?.code === "number" ? `_meta_${payload.error.code}` : ""}` };
  } catch {
    return { state: "unknown", externalMessageId: null, code: "network_outcome_unknown" };
  }
}

export async function verifyOfficialBillingNumber(phoneNumberId: string, businessAccountId: string, token: string) {
  const version = resolveWhatsAppGraphVersion();
  const url = new URL(`https://graph.facebook.com/${version}/${encodeURIComponent(businessAccountId)}/phone_numbers`);
  url.searchParams.set("fields", "id"); url.searchParams.set("limit", "100");
  const response = await fetch(url, { cache: "no-store", headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(8_000) });
  const payload = await response.json().catch(() => null) as { data?: { id?: string }[] } | null;
  // Missing/paginated-away number fails closed; never infer ownership from display name.
  return response.ok && payload?.data?.some(number => number.id === phoneNumberId) === true;
}
