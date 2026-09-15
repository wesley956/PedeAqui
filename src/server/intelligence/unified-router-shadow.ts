import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createIntelligenceContext, type ConversationMode } from "@/server/intelligence/context";
import { UnifiedIntelligenceRouter, type UnifiedRouterDecision } from "@/server/intelligence/unified-router";

type IngestResult = {
  conversation_id?: string;
  message_id?: string;
  message_created?: boolean;
};

type SessionRow = {
  step?: string | null;
  state?: string | null;
  context?: unknown;
  expires_at?: string | null;
};

function sessionKind(session: SessionRow | null): "whatsapp_order" | "menu" | null {
  if (!session || session.state !== "active") return null;
  if (session.expires_at && Date.parse(session.expires_at) <= Date.now()) return null;
  const context = session.context && typeof session.context === "object" ? session.context as Record<string, unknown> : null;
  return context?.channel === "whatsapp_order" ? "whatsapp_order" : "menu";
}

export class UnifiedIntelligenceRouterShadow {
  static async afterInbound(result: unknown, requestId: string): Promise<UnifiedRouterDecision | null> {
    const ingest = result && typeof result === "object" ? result as IngestResult : null;
    if (!ingest?.conversation_id || !ingest.message_id || ingest.message_created === false) return null;

    const admin = createAdminClient();
    const { data: conversation, error: conversationError } = await admin.from("conversations")
      .select("id, organization_id, store_id, contact_id, channel, status")
      .eq("id", ingest.conversation_id)
      .maybeSingle();
    if (conversationError) throw conversationError;
    if (!conversation || conversation.channel !== "whatsapp") return null;

    const [contactResult, messageResult, sessionResult] = await Promise.all([
      admin.from("contacts")
        .select("customer_id")
        .eq("organization_id", conversation.organization_id)
        .eq("store_id", conversation.store_id)
        .eq("id", conversation.contact_id)
        .maybeSingle(),
      admin.from("messages")
        .select("body")
        .eq("organization_id", conversation.organization_id)
        .eq("store_id", conversation.store_id)
        .eq("conversation_id", conversation.id)
        .eq("id", ingest.message_id)
        .maybeSingle(),
      admin.from("automation_sessions")
        .select("step, state, context, expires_at")
        .eq("organization_id", conversation.organization_id)
        .eq("store_id", conversation.store_id)
        .eq("conversation_id", conversation.id)
        .maybeSingle(),
    ]);
    if (contactResult.error) throw contactResult.error;
    if (messageResult.error) throw messageResult.error;
    if (sessionResult.error) throw sessionResult.error;

    const mode = (["bot", "waiting_agent", "human", "closed"] as const).includes(conversation.status as never)
      ? conversation.status as ConversationMode
      : "none";
    const customerId = contactResult.data?.customer_id ?? null;
    const context = createIntelligenceContext({
      requestId,
      correlationId: requestId,
      organizationId: conversation.organization_id,
      storeId: conversation.store_id,
      channel: "whatsapp",
      businessType: "restaurant",
      actor: { type: "customer", userId: null },
      audience: "customer",
      conversation: { id: conversation.id, mode },
      identity: {
        source: "whatsapp_contact",
        trust: customerId ? "verified" : "weak",
        contactId: conversation.contact_id,
        customerId,
      },
      activeReferences: { cartId: null, orderId: null },
      external: { provider: "meta_cloud", accountId: null },
      authority: { resolved: false, key: null },
      capabilities: { resolved: false, revision: null },
    });

    const session = sessionResult.data as SessionRow | null;
    const kind = sessionKind(session);
    return UnifiedIntelligenceRouter.route({
      context,
      message: messageResult.data?.body,
      session: {
        active: kind !== null,
        kind,
        step: kind ? session?.step ?? null : null,
      },
    });
  }
}
