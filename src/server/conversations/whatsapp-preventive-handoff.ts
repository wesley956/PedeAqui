import type { NonCommercialIntent } from "@/server/conversations/whatsapp-non-commercial";

type HandoffInput = {
  organizationId: string;
  storeId: string;
  conversationId: string;
  messageId: string;
  reason: NonCommercialIntent;
};

/** No outbound response: the atomic transition preserves any concurrent human owner. */
export async function requestPreventiveHandoff(
  input: HandoffInput,
  rpc: (name: string, args: Record<string, string>) => PromiseLike<{ error: unknown }>,
): Promise<void> {
  const { error } = await rpc("conversation_preventive_handoff_internal", {
    p_organization_id: input.organizationId,
    p_store_id: input.storeId,
    p_conversation_id: input.conversationId,
    p_message_id: input.messageId,
    p_reason_code: input.reason,
  });
  if (error) throw error;
}

/** Server-only rollout scope. Empty/default configuration never enables a merchant. */
export function isPreventiveHandoffEnabled(
  organizationId: string,
  storeId: string,
  configuredScopes = process.env.WHATSAPP_NON_COMMERCIAL_HANDOFF_STORES,
): boolean {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(organizationId) || !uuid.test(storeId)) return false;
  const target = `${organizationId}:${storeId}`.toLowerCase();
  return (configuredScopes ?? "").split(",").some((scope) => scope.trim().toLowerCase() === target);
}
