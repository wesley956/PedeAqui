import "server-only";

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { ConversationService } from "@/server/conversations/conversation-service";
import { createIntelligenceContext } from "@/server/intelligence/context";

function requireStoreId(storeId: string | null) {
  if (!storeId) throw new Error("Selecione uma unidade para acessar Conversas.");
  return storeId;
}

function authorLabel(message: {
  direction: string;
  sender_type: string | null;
  sender_user_id: string | null;
  metadata?: unknown;
}) {
  if (message.direction === "inbound") return "Cliente";
  const metadata = message.metadata && typeof message.metadata === "object" ? message.metadata as Record<string, unknown> : {};
  if (metadata.source === "whatsapp_business_app") return "WhatsApp Business";
  if (message.sender_type === "bot") return "Robô";
  if (message.sender_type === "agent" || message.sender_user_id) return "Atendente PedeAqui";
  return "Sistema";
}

export class InboxIntelligenceService {
  static async load(conversationId: string) {
    const access = await authorize(PERMISSIONS.CONVERSATIONS_VIEW);
    const storeId = requireStoreId(access.storeId);
    const detail = await ConversationService.loadConversation(conversationId);
    const admin = createAdminClient();

    const messageIds = detail.messages.map((message) => message.id);
    const { data: metadataRows, error } = messageIds.length > 0
      ? await admin.from("messages")
        .select("id, metadata")
        .eq("organization_id", access.organizationId)
        .eq("store_id", storeId)
        .eq("conversation_id", conversationId)
        .in("id", messageIds)
      : { data: [], error: null };
    if (error) throw error;

    const metadataById = new Map((metadataRows ?? []).map((row) => [row.id, row.metadata]));
    const messages = detail.messages.map((message) => {
      const metadata = metadataById.get(message.id) ?? {};
      return {
        ...message,
        metadata,
        authorLabel: authorLabel({ ...message, metadata }),
      };
    });

    const intelligenceContext = createIntelligenceContext({
      requestId: `inbox:${randomUUID()}`,
      correlationId: `conversation:${detail.conversation.id}`,
      organizationId: access.organizationId,
      storeId,
      channel: "merchant_panel",
      businessType: "unresolved",
      actor: { type: "merchant_user", userId: access.userId },
      audience: "agent",
      conversation: {
        id: detail.conversation.id,
        mode: detail.conversation.status,
      },
      identity: {
        source: "authenticated_user",
        trust: "privileged",
        contactId: null,
        customerId: null,
      },
      activeReferences: { cartId: null, orderId: null },
      external: { provider: detail.conversation.channel === "whatsapp" ? "meta_cloud" : null, accountId: null },
      authority: { resolved: false, key: null },
      capabilities: { resolved: false, revision: null },
    });

    return {
      ...detail,
      messages,
      intelligenceContext,
      subject: {
        contactId: detail.contact?.id ?? null,
        customerId: detail.contact?.customer_id ?? null,
      },
      returnToBotPolicy: "manual_only" as const,
    };
  }
}
