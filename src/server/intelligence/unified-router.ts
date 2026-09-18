import type { AuthorityFacts, AuthorityOperation, AuthorityOperationDecision } from "@/server/intelligence/authority";
import { AuthorityResolver } from "@/server/intelligence/authority";
import type { CapabilityDecision, CapabilityFacts, IntelligenceCapabilityKey } from "@/server/intelligence/capability";
import { CapabilitySnapshotResolver } from "@/server/intelligence/capability";
import type { IntelligenceContext } from "@/server/intelligence/context";
import { normalizeBotInput, resolveWhatsAppBotIntent, type WhatsAppBotIntent } from "@/server/conversations/bot-menu";
import {
  asksForMenuDescription,
  catalogAvailabilityQueryFromInput,
} from "@/server/conversations/whatsapp-catalog-intent-core";

export type UnifiedRouterTool =
  | "human_handoff"
  | "catalog"
  | "order_tracking"
  | "whatsapp_order"
  | "growth_benefits"
  | "conversation_info"
  | "fallback";

export type UnifiedRouterIntent = WhatsAppBotIntent
  | "order_continue"
  | "menu_summary"
  | "catalog_availability";

export type UnifiedRouterSession = {
  active: boolean;
  kind: "whatsapp_order" | "menu" | null;
  step: string | null;
};

export type UnifiedRouterInput = {
  context: IntelligenceContext;
  message: string | null | undefined;
  session: UnifiedRouterSession;
  capabilityFacts?: CapabilityFacts | null;
  authorityFacts?: AuthorityFacts | null;
};

export type UnifiedRouterDecision = {
  mode: "shadow";
  intent: UnifiedRouterIntent;
  confidence: "high" | "contextual" | "low";
  tool: UnifiedRouterTool | null;
  requiredCapability: IntelligenceCapabilityKey | null;
  capabilityDecision: CapabilityDecision | null;
  authorityOperation: AuthorityOperation | null;
  authorityDecision: AuthorityOperationDecision | null;
  wouldHandle: boolean;
  handoffReason: "human_lock" | "explicit_handoff" | "capability_denied" | "authority_denied" | "low_confidence" | null;
  trace: readonly [
    "context",
    "human_lock",
    "active_session",
    "intent",
    "capability",
    "authority",
    "adapter",
  ];
};

const TRACE = [
  "context",
  "human_lock",
  "active_session",
  "intent",
  "capability",
  "authority",
  "adapter",
] as const;

type IntentPolicy = {
  tool: UnifiedRouterTool;
  capability: IntelligenceCapabilityKey | null;
  authority: AuthorityOperation | null;
};

const POLICIES: Record<UnifiedRouterIntent, IntentPolicy> = {
  menu: { tool: "conversation_info", capability: "canAutoReply", authority: null },
  menu_link: { tool: "catalog", capability: "canSearchCatalog", authority: null },
  menu_summary: { tool: "catalog", capability: "canSearchCatalog", authority: null },
  catalog_availability: { tool: "catalog", capability: "canSearchCatalog", authority: null },
  track_start: { tool: "order_tracking", capability: "canAutoReply", authority: "view_order" },
  track_code: { tool: "order_tracking", capability: "canAutoReply", authority: "view_order" },
  handoff: { tool: "human_handoff", capability: null, authority: null },
  benefit_handoff: { tool: "human_handoff", capability: null, authority: null },
  hours: { tool: "conversation_info", capability: "canAutoReply", authority: null },
  payment: { tool: "conversation_info", capability: "canAutoReply", authority: null },
  delivery: { tool: "conversation_info", capability: "canAutoReply", authority: null },
  price: { tool: "catalog", capability: "canSearchCatalog", authority: null },
  order_start: { tool: "whatsapp_order", capability: "canCreateOrder", authority: null },
  benefits: { tool: "growth_benefits", capability: "canShowGrowthBenefits", authority: null },
  cashback: { tool: "growth_benefits", capability: "canShowGrowthBenefits", authority: null },
  points: { tool: "growth_benefits", capability: "canShowGrowthBenefits", authority: null },
  coupons: { tool: "growth_benefits", capability: "canShowGrowthBenefits", authority: null },
  promotions: { tool: "catalog", capability: "canSearchCatalog", authority: null },
  unknown: { tool: "fallback", capability: "canAutoReply", authority: null },
  order_continue: { tool: "whatsapp_order", capability: "canCreateOrder", authority: null },
};

const ACTIVE_ORDER_ESCAPE_INTENTS = new Set<WhatsAppBotIntent>([
  "menu",
  "menu_link",
  "payment",
  "price",
  "handoff",
  "benefit_handoff",
  "track_start",
  "track_code",
  "benefits",
  "cashback",
  "points",
  "coupons",
  "promotions",
]);

function resolveIntent(input: UnifiedRouterInput): {
  intent: UnifiedRouterIntent;
  confidence: UnifiedRouterDecision["confidence"];
} {
  const activeOrder = input.session.active && input.session.kind === "whatsapp_order";
  if (asksForMenuDescription(input.message)) {
    return { intent: "menu_summary", confidence: activeOrder ? "contextual" : "high" };
  }
  if (catalogAvailabilityQueryFromInput(input.message)) {
    return { intent: "catalog_availability", confidence: activeOrder ? "contextual" : "high" };
  }

  const menuStep = input.session.active && input.session.kind === "menu" && input.session.step === "awaiting_tracking_code"
    ? "awaiting_tracking_code"
    : "menu";
  const explicit = resolveWhatsAppBotIntent(input.message, menuStep);

  if (activeOrder) {
    const normalized = normalizeBotInput(input.message);
    const explicitTrackingInterruption = explicit === "track_code"
      || (explicit === "track_start" && /\b(?:acompanhar|rastrear|status|cade|onde esta|como esta|ja saiu)\b/.test(normalized));
    if (explicit === "track_start" && !explicitTrackingInterruption) {
      return { intent: "order_continue", confidence: "contextual" };
    }
    if (!ACTIVE_ORDER_ESCAPE_INTENTS.has(explicit)) {
      return { intent: "order_continue", confidence: "contextual" };
    }
    return { intent: explicit, confidence: "contextual" };
  }
  if (explicit === "unknown") return { intent: explicit, confidence: "low" };
  return { intent: explicit, confidence: "high" };
}

export class UnifiedIntelligenceRouter {
  static route(input: UnifiedRouterInput): UnifiedRouterDecision {
    if (input.context.conversation.mode === "human" || input.context.conversation.mode === "waiting_agent") {
      return {
        mode: "shadow",
        intent: "handoff",
        confidence: "contextual",
        tool: null,
        requiredCapability: null,
        capabilityDecision: null,
        authorityOperation: null,
        authorityDecision: null,
        wouldHandle: false,
        handoffReason: "human_lock",
        trace: TRACE,
      };
    }

    const { intent, confidence } = resolveIntent(input);
    const policy = POLICIES[intent];

    if (intent === "handoff" || intent === "benefit_handoff") {
      return {
        mode: "shadow",
        intent,
        confidence,
        tool: policy.tool,
        requiredCapability: null,
        capabilityDecision: null,
        authorityOperation: null,
        authorityDecision: null,
        wouldHandle: true,
        handoffReason: "explicit_handoff",
        trace: TRACE,
      };
    }

    const capabilityDecision = policy.capability && input.capabilityFacts
      ? CapabilitySnapshotResolver.resolve(input.context, input.capabilityFacts).decisions[policy.capability]
      : null;
    if (capabilityDecision && !capabilityDecision.allowed) {
      return {
        mode: "shadow",
        intent,
        confidence,
        tool: policy.tool,
        requiredCapability: policy.capability,
        capabilityDecision,
        authorityOperation: policy.authority,
        authorityDecision: null,
        wouldHandle: false,
        handoffReason: "capability_denied",
        trace: TRACE,
      };
    }

    const authorityDecision = policy.authority && input.authorityFacts
      ? AuthorityResolver.resolve(input.context, input.authorityFacts).decisions[policy.authority]
      : null;
    if (authorityDecision && !authorityDecision.allowed) {
      return {
        mode: "shadow",
        intent,
        confidence,
        tool: policy.tool,
        requiredCapability: policy.capability,
        capabilityDecision,
        authorityOperation: policy.authority,
        authorityDecision,
        wouldHandle: false,
        handoffReason: "authority_denied",
        trace: TRACE,
      };
    }

    return {
      mode: "shadow",
      intent,
      confidence,
      tool: policy.tool,
      requiredCapability: policy.capability,
      capabilityDecision,
      authorityOperation: policy.authority,
      authorityDecision,
      wouldHandle: confidence !== "low",
      handoffReason: confidence === "low" ? "low_confidence" : null,
      trace: TRACE,
    };
  }
}
