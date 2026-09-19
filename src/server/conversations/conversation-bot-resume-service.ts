import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { hashCartToken } from "@/server/cart/cart-token";
import {
  isResumeOrderStep,
  resolveBotResumeSession,
  resumeCartToken,
  type BotResumeSessionReason,
} from "@/server/conversations/conversation-bot-resume-policy";

const SAFE_MENU_TTL_MINUTES = 45;

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

export class ConversationBotResumeService {
  static async resume(conversationId: string): Promise<ConversationBotResumeResult> {
    const access = await authorize(PERMISSIONS.CONVERSATIONS_MANAGE);
    const storeId = requireStoreId(access.storeId);
    const admin = createAdminClient();

    const { data: conversation, error: conversationError } = await admin.from("conversations")
      .select("id, status")
      .eq("id", conversationId)
      .eq("organization_id", access.organizationId)
      .eq("store_id", storeId)
      .maybeSingle();
    if (conversationError) throw conversationError;
    if (!conversation) throw new Error("Conversa não encontrada nesta unidade.");
    if (conversation.status === "closed") throw new Error("Conversa encerrada não pode voltar diretamente ao robô.");
    if (conversation.status === "bot") {
      return { mode: "preserved", reason: "preserve_non_order_step", restoredStep: null, orderId: null };
    }

    const { data: session, error: sessionError } = await admin.from("automation_sessions")
      .select("state, step, context, expires_at")
      .eq("organization_id", access.organizationId)
      .eq("store_id", storeId)
      .eq("conversation_id", conversationId)
      .maybeSingle();
    if (sessionError) throw sessionError;

    let cartActive: boolean | null = null;
    let correlatedOrder: { id: string; display_number: number; order_status: string } | null = null;
    const token = session && isResumeOrderStep(session.step) ? resumeCartToken(session.context) : null;
    if (token) {
      const { data: cart, error: cartError } = await admin.from("carts")
        .select("id, status, expires_at")
        .eq("organization_id", access.organizationId)
        .eq("store_id", storeId)
        .eq("token_hash", hashCartToken(token))
        .maybeSingle();
      if (cartError) throw cartError;

      if (cart) {
        cartActive = cart.status === "active" && Date.parse(cart.expires_at) > Date.now();
        const { data: order, error: orderError } = await admin.from("orders")
          .select("id, display_number, order_status")
          .eq("organization_id", access.organizationId)
          .eq("store_id", storeId)
          .eq("source_cart_id", cart.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (orderError) throw orderError;
        correlatedOrder = order ? {
          id: order.id,
          display_number: Number(order.display_number),
          order_status: order.order_status,
        } : null;
      } else {
        cartActive = false;
      }
    }

    const decision = resolveBotResumeSession({
      session: session ? {
        state: session.state,
        step: session.step,
        context: session.context,
        expiresAt: session.expires_at,
      } : null,
      nowMs: Date.now(),
      cartActive,
      cartConvertedToOrder: Boolean(correlatedOrder),
    });

    const { error: transitionError } = await admin.rpc("conversation_transition_internal", {
      p_conversation_id: conversationId,
      p_target_state: "bot",
      p_assigned_user_id: null,
      p_reason: decision.mode === "preserve"
        ? `Atendimento devolvido ao bot com contexto preservado (${decision.reason})`
        : `Atendimento devolvido ao bot com recuperação segura (${decision.reason})`,
      p_actor_user_id: access.userId,
      p_source: "panel",
    });
    if (transitionError) throw transitionError;

    if (decision.mode === "safe_menu") {
      const expiresAt = new Date(Date.now() + SAFE_MENU_TTL_MINUTES * 60 * 1000).toISOString();
      const { error: recoveryError } = await admin.rpc("automation_session_upsert_internal", {
        p_conversation_id: conversationId,
        p_step: "menu",
        p_context: {
          channel: "whatsapp_menu",
          version: 4,
          resume_recovery: {
            reason: decision.reason,
            recovered_at: new Date().toISOString(),
          },
          active_order: correlatedOrder ? {
            order_id: correlatedOrder.id,
            display_number: correlatedOrder.display_number,
            order_status: correlatedOrder.order_status,
            source: "source_cart_id",
          } : null,
        },
        p_last_input_message_id: null,
        p_expires_at: expiresAt,
      });
      if (recoveryError) throw recoveryError;
      return {
        mode: "recovered",
        reason: decision.reason,
        restoredStep: "menu",
        orderId: correlatedOrder?.id ?? null,
      };
    }

    return {
      mode: "preserved",
      reason: decision.reason,
      restoredStep: session?.step ?? null,
      orderId: null,
    };
  }
}
