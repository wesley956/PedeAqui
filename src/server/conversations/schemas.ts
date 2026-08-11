import { z } from "zod";

export const conversationStatusSchema = z.enum(["bot", "waiting_agent", "human", "closed"]);

export const conversationTransitionInputSchema = z.object({
  conversationId: z.string().uuid(),
  targetState: conversationStatusSchema,
  reason: z.string().trim().max(500).nullable().optional(),
});

export const conversationReplyInputSchema = z.object({
  conversationId: z.string().uuid(),
  body: z.string().trim().min(1).max(16000),
  clientMessageId: z.string().trim().min(8).max(180).optional(),
});

export const inboxFilterSchema = z.enum(["all", "bot", "waiting_agent", "human", "closed"]);

export type ConversationTransitionInput = z.infer<typeof conversationTransitionInputSchema>;
export type ConversationReplyInput = z.infer<typeof conversationReplyInputSchema>;
export type InboxFilter = z.infer<typeof inboxFilterSchema>;
