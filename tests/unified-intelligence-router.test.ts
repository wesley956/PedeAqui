import { describe, expect, it } from "vitest";
import type { AuthorityFacts } from "@/server/intelligence/authority";
import type { CapabilityFacts, CapabilityModuleFacts } from "@/server/intelligence/capability";
import { createIntelligenceContext, type ConversationMode } from "@/server/intelligence/context";
import { UnifiedIntelligenceRouter } from "@/server/intelligence/unified-router";

const organizationId = "11111111-1111-4111-8111-111111111111";
const storeId = "22222222-2222-4222-8222-222222222222";
const conversationId = "33333333-3333-4333-8333-333333333333";
const contactId = "44444444-4444-4444-8444-444444444444";
const customerId = "55555555-5555-4555-8555-555555555555";
const orderId = "66666666-6666-4666-8666-666666666666";

function context(mode: ConversationMode = "bot", activeOrderId: string | null = null) {
  return createIntelligenceContext({
    requestId: "req-int10",
    correlationId: "corr-int10",
    organizationId,
    storeId,
    channel: "whatsapp",
    businessType: "restaurant",
    actor: { type: "customer", userId: null },
    audience: "customer",
    conversation: { id: conversationId, mode },
    identity: { source: "whatsapp_contact", trust: "verified", contactId, customerId },
    activeReferences: { cartId: null, orderId: activeOrderId },
    external: { provider: "meta_cloud", accountId: null },
    authority: { resolved: false, key: null },
    capabilities: { resolved: false, revision: null },
  });
}

const available: CapabilityModuleFacts = { available: true, reason: "available", missingDependencies: [] };

function capabilityFacts(overrides: Partial<CapabilityFacts> = {}): CapabilityFacts {
  return {
    organizationId,
    storeId,
    businessType: "restaurant",
    storeStatus: "active",
    modules: {
      conversations: available,
      catalog: available,
      orders: available,
      deliveries: available,
      growth: available,
      dashboard: available,
    },
    permissions: new Set(["orders.create", "orders.edit", "growth.manage", "dashboard.view"]),
    featureFlags: {},
    providerReadiness: {},
    operationalConfig: {},
    revision: "int10-test",
    ...overrides,
  };
}

function inactiveSession() {
  return { active: false, kind: null, step: null } as const;
}

function activeOrderSession() {
  return { active: true, kind: "whatsapp_order", step: "order_items" } as const;
}

describe("UnifiedIntelligenceRouter", () => {
  it("applies human lock before any automation", () => {
    const decision = UnifiedIntelligenceRouter.route({
      context: context("human"),
      message: "quero fazer um pedido",
      session: activeOrderSession(),
      capabilityFacts: capabilityFacts(),
    });

    expect(decision.intent).toBe("handoff");
    expect(decision.tool).toBeNull();
    expect(decision.wouldHandle).toBe(false);
    expect(decision.handoffReason).toBe("human_lock");
    expect(decision.trace).toEqual(["context", "human_lock", "active_session", "intent", "capability", "authority", "adapter"]);
  });

  it("keeps an active WhatsApp order ahead of a generic or unknown intent", () => {
    const decision = UnifiedIntelligenceRouter.route({
      context: context(),
      message: "duas coca sem gelo",
      session: activeOrderSession(),
      capabilityFacts: capabilityFacts(),
    });

    expect(decision.intent).toBe("order_continue");
    expect(decision.confidence).toBe("contextual");
    expect(decision.tool).toBe("whatsapp_order");
    expect(decision.requiredCapability).toBe("canCreateOrder");
    expect(decision.wouldHandle).toBe(true);
  });

  it("does not let an active order steal menu, handoff, tracking or benefits", () => {
    const cases = [
      ["menu", "menu", "conversation_info"],
      ["falar com atendente", "handoff", "human_handoff"],
      ["status do pedido", "track_start", "order_tracking"],
      ["meus pontos", "points", "growth_benefits"],
    ] as const;

    for (const [message, intent, tool] of cases) {
      const decision = UnifiedIntelligenceRouter.route({
        context: context(),
        message,
        session: activeOrderSession(),
        capabilityFacts: capabilityFacts(),
      });
      expect(decision.intent).toBe(intent);
      expect(decision.tool).toBe(tool);
    }
  });

  it("preserves tracking-code session context over the generic menu classifier", () => {
    const decision = UnifiedIntelligenceRouter.route({
      context: context(),
      message: "42",
      session: { active: true, kind: "menu", step: "awaiting_tracking_code" },
      capabilityFacts: capabilityFacts(),
    });

    expect(decision.intent).toBe("track_code");
    expect(decision.tool).toBe("order_tracking");
  });

  it("returns low-confidence fallback without claiming the message", () => {
    const decision = UnifiedIntelligenceRouter.route({
      context: context(),
      message: "xyzzy completamente fora do contexto",
      session: inactiveSession(),
      capabilityFacts: capabilityFacts(),
    });

    expect(decision.intent).toBe("unknown");
    expect(decision.confidence).toBe("low");
    expect(decision.tool).toBe("fallback");
    expect(decision.wouldHandle).toBe(false);
    expect(decision.handoffReason).toBe("low_confidence");
  });

  it("stops at capability denied without executing an adapter", () => {
    const facts = capabilityFacts({
      modules: { conversations: available, catalog: available, orders: { available: false, reason: "disabled_by_store", missingDependencies: [] } },
    });
    const decision = UnifiedIntelligenceRouter.route({
      context: context(),
      message: "quero fazer um pedido",
      session: inactiveSession(),
      capabilityFacts: facts,
    });

    expect(decision.intent).toBe("order_start");
    expect(decision.capabilityDecision?.allowed).toBe(false);
    expect(decision.wouldHandle).toBe(false);
    expect(decision.handoffReason).toBe("capability_denied");
  });

  it("stops at authority denied for scoped tracking when authority facts disagree", () => {
    const authorityFacts: AuthorityFacts = {
      kind: "internal",
      organizationId,
      storeId: "77777777-7777-4777-8777-777777777777",
      orderId,
    };
    const decision = UnifiedIntelligenceRouter.route({
      context: context("bot", orderId),
      message: "status do pedido",
      session: inactiveSession(),
      capabilityFacts: capabilityFacts(),
      authorityFacts,
    });

    expect(decision.authorityOperation).toBe("view_order");
    expect(decision.authorityDecision?.allowed).toBe(false);
    expect(decision.authorityDecision?.reason).toBe("scope_mismatch");
    expect(decision.wouldHandle).toBe(false);
    expect(decision.handoffReason).toBe("authority_denied");
  });

  it("routes growth intents through the canonical growth capability", () => {
    const decision = UnifiedIntelligenceRouter.route({
      context: context(),
      message: "tenho cupom?",
      session: inactiveSession(),
      capabilityFacts: capabilityFacts(),
    });

    expect(decision.intent).toBe("coupons");
    expect(decision.tool).toBe("growth_benefits");
    expect(decision.requiredCapability).toBe("canShowGrowthBenefits");
    expect(decision.capabilityDecision?.allowed).toBe(true);
  });

  it("is deterministic and side-effect free for the same input", () => {
    const input = {
      context: context(),
      message: "quero pedir",
      session: inactiveSession(),
      capabilityFacts: capabilityFacts(),
    };

    expect(UnifiedIntelligenceRouter.route(input)).toEqual(UnifiedIntelligenceRouter.route(input));
  });

  it("preserves tenant/store isolation through the canonical capability resolver", () => {
    const decision = UnifiedIntelligenceRouter.route({
      context: context(),
      message: "cardapio",
      session: inactiveSession(),
      capabilityFacts: capabilityFacts({ storeId: "77777777-7777-4777-8777-777777777777" }),
    });

    expect(decision.capabilityDecision?.allowed).toBe(false);
    expect(decision.capabilityDecision?.reasons).toContain("scope_mismatch");
    expect(decision.wouldHandle).toBe(false);
  });
});
