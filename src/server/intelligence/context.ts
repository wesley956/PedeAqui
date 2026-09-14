import { z } from "zod";

export const intelligenceChannels = ["web", "whatsapp", "merchant_panel", "system"] as const;
export const intelligenceActors = ["customer", "merchant_user", "system"] as const;
export const intelligenceAudiences = ["customer", "agent", "merchant", "system"] as const;
export const conversationModes = ["bot", "waiting_agent", "human", "closed", "none"] as const;
export const identitySources = ["anonymous", "browser_recognition", "whatsapp_contact", "authenticated_user", "manual_authorized_link", "system"] as const;
export const identityTrustLevels = ["none", "weak", "verified", "privileged"] as const;

export type IntelligenceChannel = (typeof intelligenceChannels)[number];
export type IntelligenceActor = (typeof intelligenceActors)[number];
export type IntelligenceAudience = (typeof intelligenceAudiences)[number];
export type ConversationMode = (typeof conversationModes)[number];
export type IdentitySource = (typeof identitySources)[number];
export type IdentityTrustLevel = (typeof identityTrustLevels)[number];

const uuid = z.string().uuid();

export const intelligenceContextSchema = z.object({
  requestId: z.string().trim().min(1).max(128),
  correlationId: z.string().trim().min(1).max(128),
  organizationId: uuid,
  storeId: uuid,
  channel: z.enum(intelligenceChannels),
  businessType: z.string().trim().min(1).max(64),
  actor: z.object({
    type: z.enum(intelligenceActors),
    userId: uuid.nullable(),
  }),
  audience: z.enum(intelligenceAudiences),
  conversation: z.object({
    id: uuid.nullable(),
    mode: z.enum(conversationModes),
  }),
  identity: z.object({
    source: z.enum(identitySources),
    trust: z.enum(identityTrustLevels),
    contactId: uuid.nullable(),
    customerId: uuid.nullable(),
  }),
  activeReferences: z.object({
    cartId: uuid.nullable(),
    orderId: uuid.nullable(),
  }),
  external: z.object({
    provider: z.string().trim().min(1).max(64).nullable(),
    accountId: uuid.nullable(),
  }),
  authority: z.object({ resolved: z.boolean(), key: z.string().trim().min(1).max(128).nullable() }),
  capabilities: z.object({ resolved: z.boolean(), revision: z.string().trim().min(1).max(128).nullable() }),
}).superRefine((value, ctx) => {
  if (value.actor.type === "merchant_user" && !value.actor.userId) {
    ctx.addIssue({ code: "custom", path: ["actor", "userId"], message: "Merchant user requires an authenticated user id" });
  }
  if (value.channel !== "whatsapp" && value.identity.source === "whatsapp_contact") {
    ctx.addIssue({ code: "custom", path: ["identity", "source"], message: "WhatsApp identity requires the WhatsApp channel" });
  }
  if (value.identity.source === "browser_recognition" && value.channel !== "web") {
    ctx.addIssue({ code: "custom", path: ["identity", "source"], message: "Browser recognition requires the web channel" });
  }
  if (value.identity.trust === "none" && value.identity.customerId) {
    ctx.addIssue({ code: "custom", path: ["identity", "customerId"], message: "Untrusted identity cannot carry a customer id" });
  }
});

export type IntelligenceContext = z.infer<typeof intelligenceContextSchema>;
export type IntelligenceContextInput = z.input<typeof intelligenceContextSchema>;

export function createIntelligenceContext(input: IntelligenceContextInput): IntelligenceContext {
  return intelligenceContextSchema.parse(input);
}

