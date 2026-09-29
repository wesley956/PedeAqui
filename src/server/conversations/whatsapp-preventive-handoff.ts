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
