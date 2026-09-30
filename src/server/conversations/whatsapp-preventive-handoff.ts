import { createAdminClient } from "@/lib/supabase/admin";
import type { NonCommercialIntent } from "@/server/conversations/whatsapp-non-commercial";
import { WhatsAppCloudProvider, resolveWhatsAppAccessToken, safeWhatsAppFailureMessage } from "@/server/conversations/provider";
import { recordFailure } from "@/server/observability/failure";

type HandoffInput = {
  organizationId: string;
  storeId: string;
  conversationId: string;
  messageId: string;
  reason: NonCommercialIntent;
};

type RpcResult = {
  data?: unknown;
  error: unknown;
};

type ClaimedOutbound = {
  claimed?: boolean;
  message_id?: string;
};

type TransitionedConversation = {
  status?: string;
};

function asTransitionedConversation(value: unknown): TransitionedConversation | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as TransitionedConversation
    : null;
}

/**
 * Atomically hands the conversation to a human and, when configured, sends the
 * merchant's handoff message exactly once. The outbound message is claimed while
 * the conversation is still in bot state, but is only delivered after the
 * atomic handoff confirms waiting_agent. A concurrent human owner therefore wins
 * without receiving an incorrect automatic handoff notice.
 */
export async function requestPreventiveHandoff(
  input: HandoffInput,
  rpc: (name: string, args: Record<string, string | null>) => PromiseLike<RpcResult>,
): Promise<void> {
  const admin = createAdminClient();
  const [{ data: conversation, error: conversationError }, { data: settings, error: settingsError }] = await Promise.all([
    admin.from("conversations")
      .select("contact_id")
      .eq("id", input.conversationId)
      .eq("organization_id", input.organizationId)
      .eq("store_id", input.storeId)
      .maybeSingle(),
    admin.from("store_conversation_settings")
      .select("handoff_message,whatsapp_phone_number_id,access_token_secret_ref")
      .eq("organization_id", input.organizationId)
      .eq("store_id", input.storeId)
      .maybeSingle(),
  ]);
  if (conversationError) throw conversationError;
  if (settingsError) throw settingsError;

  const handoffMessage = settings?.handoff_message?.trim() ?? "";
  let recipient: string | null = null;
  if (handoffMessage && conversation?.contact_id) {
    const { data: contact, error: contactError } = await admin.from("contacts")
      .select("external_id")
      .eq("organization_id", input.organizationId)
      .eq("store_id", input.storeId)
      .eq("id", conversation.contact_id)
      .maybeSingle();
    if (contactError) throw contactError;
    recipient = contact?.external_id ?? null;
  }

  let claimedMessageId: string | null = null;
  if (handoffMessage && settings?.whatsapp_phone_number_id && settings.access_token_secret_ref && recipient) {
    const { data: claim, error: claimError } = await rpc("conversation_claim_bot_outbound_internal", {
      p_conversation_id: input.conversationId,
      p_body: handoffMessage,
      p_client_message_id: `auto:wa-preventive-handoff:${input.messageId}`,
    });
    if (claimError) throw claimError;
    const claimed = claim as ClaimedOutbound | null;
    if (claimed?.claimed && claimed.message_id) claimedMessageId = claimed.message_id;
  }

  const { data: transitioned, error } = await rpc("conversation_preventive_handoff_internal", {
    p_organization_id: input.organizationId,
    p_store_id: input.storeId,
    p_conversation_id: input.conversationId,
    p_message_id: input.messageId,
    p_reason_code: input.reason,
  });
  if (error) throw error;

  const transition = asTransitionedConversation(transitioned);
  if (!claimedMessageId) return;

  if (transition?.status !== "waiting_agent") {
    await rpc("conversation_mark_outbound_result_internal", {
      p_message_id: claimedMessageId,
      p_external_message_id: null,
      p_status: "failed",
      p_error_code: "handoff_not_applied",
      p_error_message: "Preventive handoff was not applied because conversation ownership changed.",
    });
    return;
  }

  try {
    const provider = new WhatsAppCloudProvider(resolveWhatsAppAccessToken(settings!.access_token_secret_ref));
    const sent = await provider.sendText({
      phoneNumberId: settings!.whatsapp_phone_number_id,
      recipient: recipient!,
      body: handoffMessage,
    });
    const { error: markError } = await rpc("conversation_mark_outbound_result_internal", {
      p_message_id: claimedMessageId,
      p_external_message_id: sent.externalMessageId,
      p_status: "sent",
      p_error_code: null,
      p_error_message: null,
    });
    if (markError) throw markError;
  } catch (sendError) {
    recordFailure("whatsapp.preventive_handoff.notice_failed", sendError, {
      organizationId: input.organizationId,
      storeId: input.storeId,
      conversationId: input.conversationId,
      messageId: input.messageId,
    });
    await rpc("conversation_mark_outbound_result_internal", {
      p_message_id: claimedMessageId,
      p_external_message_id: null,
      p_status: "failed",
      p_error_code: "provider_error",
      p_error_message: safeWhatsAppFailureMessage(sendError),
    });
  }
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
