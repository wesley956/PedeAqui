import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";

const CLAIM_CONFLICT_MESSAGE = "conversation already assigned to another user";

export class ConversationClaimConflictError extends Error {
  constructor() {
    super("Esta conversa já foi assumida por outro usuário.");
    this.name = "ConversationClaimConflictError";
  }
}

function requireStoreId(storeId: string | null) {
  if (!storeId) throw new Error("Selecione uma unidade para acessar Conversas.");
  return storeId;
}

export class ConversationClaimService {
  static async assume(conversationId: string) {
    const context = await authorize(PERMISSIONS.CONVERSATIONS_MANAGE);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();

    const { data, error } = await admin.rpc("conversation_claim_human_internal", {
      p_organization_id: context.organizationId,
      p_store_id: storeId,
      p_conversation_id: conversationId,
      p_assigned_user_id: context.userId,
      p_reason: "Atendimento assumido",
      p_actor_user_id: context.userId,
      p_source: "panel",
    });

    if (error) {
      if (error.message.includes(CLAIM_CONFLICT_MESSAGE)) {
        throw new ConversationClaimConflictError();
      }
      throw error;
    }

    return data;
  }
}
