export type ConversationStatus = "bot" | "waiting_agent" | "human" | "closed";
export type MessageDeliveryStatus = "received" | "pending" | "sent" | "delivered" | "read" | "failed";

const transitions: Record<ConversationStatus, readonly ConversationStatus[]> = {
  bot: ["waiting_agent", "human", "closed"],
  waiting_agent: ["bot", "human", "closed"],
  human: ["bot", "waiting_agent", "closed"],
  closed: ["bot", "waiting_agent"],
};

export function canTransitionConversation(from: ConversationStatus, to: ConversationStatus) {
  return from === to || transitions[from].includes(to);
}

export function conversationStatusLabel(status: ConversationStatus) {
  const labels: Record<ConversationStatus, string> = {
    bot: "Bot",
    waiting_agent: "Aguardando atendente",
    human: "Atendimento humano",
    closed: "Encerrada",
  };
  return labels[status];
}

export function normalizeWhatsAppIdentifier(value: string | null | undefined) {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 20 ? digits : null;
}

export function messagePreview(value: string | null | undefined, maxLength = 90) {
  const normalized = (value ?? "").replace(/\s+/g, " ").trim();
  if (!normalized) return "Mensagem sem texto";
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, Math.max(1, maxLength - 1))}…`;
}

export function deliveryRank(status: MessageDeliveryStatus) {
  const ranks: Record<MessageDeliveryStatus, number> = {
    failed: -1,
    received: 0,
    pending: 0,
    sent: 1,
    delivered: 2,
    read: 3,
  };
  return ranks[status];
}
