import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export type InboundIngestResult = {
  conversation_id?: string | null;
  message_id?: string | null;
  message_created?: boolean | null;
};

export type InboundOutcome =
  | "outbound_recorded"
  | "waiting_agent"
  | "human"
  | "closed"
  | "ignored_non_actionable"
  | "escalated_no_reply";

export class InboundOutcomeService {
  static async finalize(result: InboundIngestResult): Promise<InboundOutcome> {
    if (!result?.conversation_id || !result.message_id) {
      throw new Error("Inbound sem referência de conversa/mensagem.");
    }

    const admin = createAdminClient();
    const [{ data: inbound, error: inboundError }, { data: conversation, error: conversationError }] = await Promise.all([
      admin.from("messages")
        .select("id, organization_id, store_id, conversation_id, created_at, content_type, body, metadata")
        .eq("id", result.message_id)
        .eq("conversation_id", result.conversation_id)
        .maybeSingle(),
      admin.from("conversations")
        .select("id, status")
        .eq("id", result.conversation_id)
        .maybeSingle(),
    ]);
    if (inboundError) throw inboundError;
    if (conversationError) throw conversationError;
    if (!inbound || !conversation) throw new Error("Inbound sem contexto canônico após persistência.");

    if (conversation.status === "waiting_agent") return "waiting_agent";
    if (conversation.status === "human") return "human";
    if (conversation.status === "closed") return "closed";

    const metadata = inbound.metadata && typeof inbound.metadata === "object"
      ? inbound.metadata as Record<string, unknown>
      : null;
    const whatsappType = typeof metadata?.whatsapp_type === "string" ? metadata.whatsapp_type : null;
    if (inbound.content_type === "unsupported" && (whatsappType === "reaction" || inbound.body === "[reaction]")) {
      return "ignored_non_actionable";
    }

    const { data: outbound, error: outboundError } = await admin.from("messages")
      .select("id")
      .eq("organization_id", inbound.organization_id)
      .eq("store_id", inbound.store_id)
      .eq("conversation_id", inbound.conversation_id)
      .eq("direction", "outbound")
      .gte("created_at", inbound.created_at)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (outboundError) throw outboundError;
    if (outbound) return "outbound_recorded";

    const { error: transitionError } = await admin.rpc("conversation_transition_internal", {
      p_conversation_id: result.conversation_id,
      p_target_state: "waiting_agent",
      p_assigned_user_id: null,
      p_reason: "Inbound sem resposta automática; encaminhado para atendimento",
      p_actor_user_id: null,
      p_source: "system",
    });
    if (transitionError) throw transitionError;
    return "escalated_no_reply";
  }
}
