import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import type { BotResumeSessionReason } from "@/server/conversations/conversation-bot-resume-policy";

function requireStoreId(storeId: string | null) {
  if (!storeId) throw new Error("Selecione uma unidade para acessar Conversas.");
  return storeId;
}

export type ConversationBotResumeResult = {
  mode: "preserved" | "recovered";
  reason: BotResumeSessionReason;
  restoredStep: string | null;
  orderId: string | null;
};

function asResumeResult(value: unknown): ConversationBotResumeResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Resposta inválida ao retomar automação da conversa.");
  }
  const raw = value as Record<string, unknown>;
  const mode = raw.mode === "preserved" || raw.mode === "recovered" ? raw.mode : null;
  const reason = typeof raw.reason === "string" ? raw.reason as BotResumeSessionReason : null;
  const restoredStep = typeof raw.restored_step === "string" ? raw.restored_step : null;
  const orderId = typeof raw.order_id === "string" ? raw.order_id : null;
  if (!mode || !reason) throw new Error("Resposta inválida ao retomar automação da conversa.");
  return { mode, reason, restoredStep, orderId };
}

export class ConversationBotResumeService {
  static async resume(conversationId: string): Promise<ConversationBotResumeResult> {
    const access = await authorize(PERMISSIONS.CONVERSATIONS_MANAGE);
    const storeId = requireStoreId(access.storeId);
    const admin = createAdminClient();

    const { data, error } = await admin.rpc("conversation_resume_bot_internal", {
      p_organization_id: access.organizationId,
      p_store_id: storeId,
      p_conversation_id: conversationId,
      p_actor_user_id: access.userId,
    });
    if (error) throw error;
    return asResumeResult(data);
  }
}
