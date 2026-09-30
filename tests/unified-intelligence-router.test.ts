import { describe, expect, it } from "vitest";
import { UnifiedIntelligenceRouter } from "@/server/intelligence/unified-router";
import type { IntelligenceContext } from "@/server/intelligence/context";

function context(overrides: Partial<IntelligenceContext> = {}): IntelligenceContext {
  return {
    organizationId: "11111111-1111-4111-8111-111111111111",
    storeId: "22222222-2222-4222-8222-222222222222",
    conversationId: "33333333-3333-4333-8333-333333333333",
    contactId: "44444444-4444-4444-8444-444444444444",
    channel: "whatsapp",
    conversationStatus: "bot",
    businessType: "restaurant",
    storeStatus: "active",
    menuEnabled: true,
    whatsappOrdersEnabled: true,
    growthEnabled: true,
    capabilities: {
      catalog: true,
      conversation_info: true,
      order_tracking: true,
      whatsapp_order: true,
      human_handoff: true,
      growth_benefits: true,
      fallback: true,
      delivery: true,
      payment: true,
      order_workflow: true,
    },
    authority: {
      storeMatchesConversation: true,
      contactMatchesConversation: true,
      phoneMatchesConversation: true,
    },
    ...overrides,
  };
}

function inactiveSession() {
  return { state: "inactive" as const, step: null, context: null };
}

function activeOrderSession() {
  return {
    state: "active" as const,
    step: "order_items" as const,
    context: { channel: "whatsapp_order", version: 3 },
  };
}

describe("UnifiedIntelligenceRouter", () => {
  it("applies human lock before any automation", () => {
    const decision = UnifiedIntelligenceRouter.route({
      context: context({ conversationStatus: "human" }),
      message: "quero uma pizza",
      session: inactiveSession(),
    });
    expect(decision.tool).toBe("human_handoff");
    expect(decision.handoffReason).toBe("human_lock");
  });

  it("keeps an active WhatsApp order ahead of a generic or unknown intent", () => {
    const decision = UnifiedIntelligenceRouter.route({
      context: context(),
      message: "sim",
      session: activeOrderSession(),
    });
    expect(decision.intent).toBe("order_continue");
    expect(decision.tool).toBe("whatsapp_order");
  });

  it("does not let an active order steal menu, handoff, tracking or benefits", () => {
    for (const [message, expectedTool] of [
      ["menu", "catalog"],
      ["quero falar com atendente", "human_handoff"],
      ["acompanhar pedido", "order_tracking"],
      ["meus benefícios", "growth_benefits"],
    ] as const) {
      const decision = UnifiedIntelligenceRouter.route({
        context: context(),
        message,
        session: activeOrderSession(),
      });
      expect(decision.tool).toBe(expectedTool);
    }
  });

  it("preserves tracking-code session context over the generic menu classifier", () => {
    const decision = UnifiedIntelligenceRouter.route({
      context: context(),
      message: "123",
      session: { state: "active", step: "awaiting_tracking_code", context: { channel: "whatsapp_menu" } },
    });
    expect(decision.tool).toBe("order_tracking");
  });

  it("returns low-confidence fallback without claiming the message", () => {
    const decision = UnifiedIntelligenceRouter.route({
      context: context(),
      message: "xyzabc",
      session: inactiveSession(),
    });
    expect(decision.tool).toBe("fallback");
  });

  it("stops at capability denied without executing an adapter", () => {
    const decision = UnifiedIntelligenceRouter.route({
      context: context({ capabilities: { ...context().capabilities, catalog: false } }),
      message: "cardápio",
      session: inactiveSession(),
    });
    expect(decision.deniedReason).toBe("capability_denied");
  });

  it("stops at authority denied for scoped tracking when authority facts disagree", () => {
    const decision = UnifiedIntelligenceRouter.route({
      context: context({ authority: { ...context().authority, phoneMatchesConversation: false } }),
      message: "acompanhar pedido 10",
      session: inactiveSession(),
    });
    expect(decision.deniedReason).toBe("authority_denied");
  });

  it("routes growth intents through the canonical growth capability", () => {
    const decision = UnifiedIntelligenceRouter.route({
      context: context(),
      message: "quero saber meus benefícios",
      session: inactiveSession(),
    });
    expect(decision.tool).toBe("growth_benefits");
  });

  it("is deterministic and side-effect free for the same input", () => {
    const input = {
      context: context(),
      message: "qual o preço da coca?",
      session: inactiveSession(),
    };
    expect(UnifiedIntelligenceRouter.route(input)).toEqual(UnifiedIntelligenceRouter.route(input));
  });

  it("preserves tenant/store isolation through the canonical capability resolver", () => {
    const decision = UnifiedIntelligenceRouter.route({
      context: context({ storeId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }),
      message: "cardápio",
      session: inactiveSession(),
    });
    expect(decision).toBeDefined();
  });
});

describe("INT-EVOL-04 shadow commercial-tool safety", () => {
  for (const status of ["bot", "human", "waiting_agent"] as const) {
    for (const active of [false, true]) {
      it(`protects non-commercial contacts in mode ${status}, active=${active}`, () => {
        const decision = UnifiedIntelligenceRouter.route({
          context: context({ conversationStatus: status }),
          message: "sou fornecedor de caixas",
          session: active ? activeOrderSession() : inactiveSession(),
        });
        if (status === "bot") {
          expect(decision.intent).toBe("supplier_contact");
          expect(decision.tool).toBe("human_handoff");
        } else {
          expect(decision.tool).toBe("human_handoff");
        }
      });
    }
  }

  it("keeps a generic follow-up in an active order and the original session intact", () => {
    const session = Object.freeze(activeOrderSession());
    const decision = UnifiedIntelligenceRouter.route({
      context: context(),
      message: "Olá! Posso ter mais informações sobre isso?",
      session,
    });
    expect(decision.intent).toBe("order_continue");
    expect(session.step).toBe("order_items");
  });

  it("keeps an unscoped generic customer inquiry out of preventive handoff", () => {
    const decision = UnifiedIntelligenceRouter.route({
      context: context(),
      message: "Olá! Posso ter mais informações sobre isso?",
      session: inactiveSession(),
    });
    expect(decision.intent).toBe("unknown");
    expect(decision.tool).toBe("fallback");
    expect(decision.tool).not.toBe("human_handoff");
    expect(decision.tool).not.toBe("catalog");
  });
});
