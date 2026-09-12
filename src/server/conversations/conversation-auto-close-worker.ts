import "server-only";

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  WhatsAppCloudProvider,
  resolveWhatsAppAccessToken,
  safeWhatsAppFailureMessage,
} from "@/server/conversations/provider";
import { recordFailure } from "@/server/observability/failure";
import { recordGrowthOperationalEvent } from "@/server/growth/growth-observability";

type Candidate = {
  conversation_id: string;
  expected_version: number;
};

type CloseResult = {
  closed?: boolean;
  reason?: string;
  conversation_id?: string;
  organization_id?: string;
  store_id?: string;
  previous_state?: "bot" | "human";
  timeout_minutes?: number;
  message_id?: string | null;
  message_body?: string | null;
  recipient?: string | null;
  phone_number_id?: string | null;
  access_token_secret_ref?: string | null;
};

export async function runConversationAutoCloseWorker(input?: { limit?: number }) {
  const startedAt = Date.now();
  const admin = createAdminClient();
  const requestId = `conversation-auto-close:${randomUUID()}`;
  const limit = Math.max(1, Math.min(input?.limit ?? 100, 250));
  const { data, error } = await admin.rpc("conversation_auto_close_candidates_internal", { p_limit: limit });
  if (error) throw error;

  const candidates = (data ?? []) as Candidate[];
  const totals = { candidates: candidates.length, closed: 0, messagesSent: 0, messageFailures: 0, skipped: 0 };
  const stores = new Map<string, { organizationId: string; storeId: string; closed: number; messagesSent: number; messageFailures: number }>();

  for (const candidate of candidates) {
    const { data: rawResult, error: closeError } = await admin.rpc("conversation_auto_close_internal", {
      p_conversation_id: candidate.conversation_id,
      p_expected_version: candidate.expected_version,
    });
    if (closeError) {
      recordFailure("conversation.auto_close.failed", closeError, { requestId, conversationId: candidate.conversation_id });
      totals.skipped += 1;
      continue;
    }

    const result = rawResult as CloseResult | null;
    if (!result?.closed) {
      totals.skipped += 1;
      continue;
    }
    totals.closed += 1;
    if (result.organization_id && result.store_id) {
      const key = `${result.organization_id}:${result.store_id}`;
      const store = stores.get(key) ?? { organizationId: result.organization_id, storeId: result.store_id, closed: 0, messagesSent: 0, messageFailures: 0 };
      store.closed += 1;
      stores.set(key, store);
    }

    if (!result.message_id || !result.message_body || !result.recipient || !result.phone_number_id || !result.access_token_secret_ref) continue;
    try {
      const provider = new WhatsAppCloudProvider(resolveWhatsAppAccessToken(result.access_token_secret_ref));
      const sent = await provider.sendText({
        phoneNumberId: result.phone_number_id,
        recipient: result.recipient,
        body: result.message_body,
      });
      const { error: markError } = await admin.rpc("conversation_mark_outbound_result_internal", {
        p_message_id: result.message_id,
        p_external_message_id: sent.externalMessageId,
        p_status: "sent",
        p_error_code: null,
        p_error_message: null,
      });
      if (markError) throw markError;
      totals.messagesSent += 1;
      const store = result.organization_id && result.store_id ? stores.get(`${result.organization_id}:${result.store_id}`) : null;
      if (store) store.messagesSent += 1;
    } catch (sendError) {
      totals.messageFailures += 1;
      const store = result.organization_id && result.store_id ? stores.get(`${result.organization_id}:${result.store_id}`) : null;
      if (store) store.messageFailures += 1;
      const sanitized = safeWhatsAppFailureMessage(sendError);
      recordFailure("conversation.auto_close.message_failed", sendError, {
        requestId,
        conversationId: result.conversation_id,
        organizationId: result.organization_id,
        storeId: result.store_id,
      });
      await admin.rpc("conversation_mark_outbound_result_internal", {
        p_message_id: result.message_id,
        p_external_message_id: null,
        p_status: "failed",
        p_error_code: "provider_error",
        p_error_message: sanitized,
      });
    }
  }

  await Promise.all([...stores.values()].map((store) => recordGrowthOperationalEvent({
    organizationId: store.organizationId,
    storeId: store.storeId,
    eventType: "conversation.auto_close",
    outcome: store.messageFailures > 0 ? "partial" : "success",
    reasonCode: store.messageFailures > 0 ? "closing_message_failed" : null,
    source: "conversation_auto_close_worker",
    counts: { closed: store.closed, messages_sent: store.messagesSent, message_failures: store.messageFailures },
    durationMs: Date.now() - startedAt,
    requestId,
  })));

  return totals;
}
