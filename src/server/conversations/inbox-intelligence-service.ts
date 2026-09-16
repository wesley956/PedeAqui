import "server-only";

import { randomUUID } from "node:crypto";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { ConversationService, type ConversationMessageRow } from "@/server/conversations/conversation-service";
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

function decorateMessages(messages: ConversationMessageRow[]) {
  return messages.map((message) => ({
    ...message,
    authorLabel: authorLabel(message),
  }));
}

export class InboxIntelligenceService {
  static async load(conversationId: string) {
    const access = await authorize(PERMISSIONS.CONVERSATIONS_VIEW);
    const storeId = requireStoreId(access.storeId);
    const detail = await ConversationService.loadConversation(conversationId);
    const messages = decorateMessages(detail.messages);

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

  static async loadMessagePage(conversationId: string, input?: { before?: string | null; after?: string | null }) {
    const page = await ConversationService.loadConversationMessages(conversationId, input);
    return {
      ...page,
      messages: decorateMessages(page.messages),
    };
  }
}
