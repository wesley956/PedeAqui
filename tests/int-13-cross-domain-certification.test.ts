import { describe, expect, it } from "vitest";
import { resolveWhatsAppBotIntent } from "@/server/conversations/bot-menu";
import { createIntelligenceContext } from "@/server/intelligence/context";
import {
  buildCrossDomainCertificationMatrix,
  compareParityValue,
  CROSS_DOMAIN_PARITY_SUITES,
  evaluateRouterDecision,
  summarizeCrossDomainCertification,
} from "@/server/intelligence/cross-domain-certification";
import { UnifiedIntelligenceRouter } from "@/server/intelligence/unified-router";

const ids = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  storeId: "22222222-2222-4222-8222-222222222222",
  conversationId: "33333333-3333-4333-8333-333333333333",
  contactId: "44444444-4444-4444-8444-444444444444",
};

function context(mode: "bot" | "waiting_agent" | "human" = "bot") {
  return createIntelligenceContext({
    requestId: "int-13-request",
    correlationId: "int-13-correlation",
    organizationId: ids.organizationId,
    storeId: ids.storeId,
    channel: "whatsapp",
    businessType: "restaurant",
    actor: { type: "customer", userId: null },
    audience: "customer",
    conversation: { id: ids.conversationId, mode },
    identity: { source: "whatsapp_contact", trust: "weak", contactId: ids.contactId, customerId: null },
    activeReferences: { cartId: null, orderId: null },
    external: { provider: "meta", accountId: null },
    authority: { resolved: false, key: null },
    capabilities: { resolved: false, revision: null },
  });
}

describe("INT-13 cross-domain certification matrix", () => {
  const matrix = buildCrossDomainCertificationMatrix();

  it("preserves all 720 Lab scenarios and enriches every scenario with the full decision contract", () => {
    expect(matrix).toHaveLength(720);
    expect(new Set(matrix.map((scenario) => scenario.id))).toHaveLength(720);
    for (const scenario of matrix) {
      expect(scenario.certificationVersion).toBe("int-13-v1");
      expect(scenario.context).toEqual(expect.objectContaining({
        tenant: "scenario-tenant",
        store: "scenario-store",
        channel: "whatsapp",
        conversationMode: "bot",
      }));
      expect(scenario.expected.interpreterIntent).toBe(scenario.intent);
      expect(scenario.expected.tool).toBeTruthy();
      expect(scenario.expected.canonicalService).toBeTruthy();
      expect(scenario.expected.audienceProjection).toBeTruthy();
      expect(scenario.expected.result).toBe(scenario.expectedAction);
      expect(["none", "prepare", "mutate", "handoff"]).toContain(scenario.expected.sideEffect);
      expect(["none", "explicit"]).toContain(scenario.expected.confirmation);
      expect(["read_only", "required", "canonical_source_cart", "canonical_transition"]).toContain(scenario.expected.idempotency);
    }
  });

  it("measures real Unified Router intent/tool selection for all 720 variants with zero critical mismatch", () => {
    const mismatches = matrix.flatMap((scenario) => {
      const orderSession = scenario.phase.startsWith("order_");
      const decision = UnifiedIntelligenceRouter.route({
        context: context(),
        message: scenario.message,
        session: orderSession
          ? { active: true, kind: "whatsapp_order", step: scenario.phase }
          : scenario.phase === "awaiting_tracking_code"
            ? { active: true, kind: "menu", step: "awaiting_tracking_code" }
            : { active: false, kind: null, step: null },
      });
      return evaluateRouterDecision(scenario, decision);
    });

    expect(mismatches).toEqual([]);
  });

  it("certifies explicit confirmation and canonical idempotency for final order creation", () => {
    const confirmations = matrix.filter((scenario) => scenario.intent === "confirmation");
    expect(confirmations.length).toBeGreaterThan(0);
    for (const scenario of confirmations) {
      expect(scenario.expected.sideEffect).toBe("mutate");
      expect(scenario.expected.confirmation).toBe("explicit");
      expect(scenario.expected.idempotency).toBe("canonical_source_cart");
      expect(scenario.expected.canonicalService).toBe("OrderService.createFromCheckout");
    }
  });

  it("keeps capacity, composition, fragmented address, contextual interruption and recovery as permanent coverage", () => {
    const base = matrix.filter((scenario) => scenario.languageVariant === "base");
    expect(base.some((scenario) => scenario.family === "quantity_package" && scenario.message === "uma caixa com 30 salgados")).toBe(true);
    expect(base.some((scenario) => scenario.family === "composition_flavors" && scenario.message.includes("15 coxinha"))).toBe(true);
    expect(base.some((scenario) => scenario.family === "fragmented_message")).toBe(true);
    expect(base.some((scenario) => scenario.phase === "order_payment" && scenario.intent === "product_question")).toBe(true);
    expect(base.some((scenario) => scenario.family === "social_recovery" && scenario.intent === "clarify")).toBe(true);
  });

  it("keeps human and waiting-agent modes locked before any automatic tool", () => {
    for (const mode of ["human", "waiting_agent"] as const) {
      const decision = UnifiedIntelligenceRouter.route({
        context: context(mode),
        message: "quero fazer um pedido",
        session: { active: false, kind: null, step: null },
      });
      expect(decision.wouldHandle).toBe(false);
      expect(decision.tool).toBeNull();
      expect(decision.handoffReason).toBe("human_lock");
    }
  });

  it("normalizes polite wrappers without turning a price question into order creation", () => {
    expect(resolveWhatsAppBotIntent("me ajuda, quero fazer um pedido por favor", "menu")).toBe("order_start");
    expect(resolveWhatsAppBotIntent("quero 30 salgados e quanto fica a entrega", "menu")).toBe("order_start");
    expect(resolveWhatsAppBotIntent("quero saber o preço do salgado", "menu")).not.toBe("order_start");
  });
});

describe("INT-13 mandatory parity suites and GO/NO-GO", () => {
  it("registers every mandatory behavioral parity family against its canonical source", () => {
    expect(CROSS_DOMAIN_PARITY_SUITES.map((suite) => suite.domain)).toEqual([
      "catalog_price",
      "payment_methods",
      "delivery_quote",
      "growth",
      "order_status",
      "workflow_notifications",
    ]);
    for (const suite of CROSS_DOMAIN_PARITY_SUITES) {
      expect(suite.intelligenceContract).toBeTruthy();
      expect(suite.canonicalSource).toBeTruthy();
      expect(suite.criticalFields).toContain("tenant");
    }
  });

  it("passes identical canonical projections and blocks every critical mismatch", () => {
    const canonical = { storeId: ids.storeId, totalCents: 4_499, method: "ticket", status: "preparing" };
    expect(compareParityValue({
      scenarioId: "parity-ok",
      field: "payment",
      intelligenceValue: canonical,
      canonicalValue: canonical,
    })).toEqual([]);

    const mismatches = [
      ...compareParityValue({ scenarioId: "catalog", field: "price", intelligenceValue: 4_500, canonicalValue: 4_499 }),
      ...compareParityValue({ scenarioId: "tenant", field: "tenant", intelligenceValue: "other-store", canonicalValue: ids.storeId }),
      ...compareParityValue({ scenarioId: "order", field: "status", intelligenceValue: "ready", canonicalValue: "preparing" }),
    ];
    expect(mismatches.every((mismatch) => mismatch.critical)).toBe(true);
    expect(summarizeCrossDomainCertification(mismatches)).toEqual(expect.objectContaining({
      totalScenarios: 720,
      paritySuites: 6,
      criticalMismatches: 3,
      gate: "NO-GO",
    }));
    expect(summarizeCrossDomainCertification()).toEqual(expect.objectContaining({
      mismatches: 0,
      criticalMismatches: 0,
      gate: "GO",
    }));
  });
});
