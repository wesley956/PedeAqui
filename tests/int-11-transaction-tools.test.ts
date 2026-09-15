import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createIntelligenceContext } from "@/server/intelligence/context";
import type { CapabilitySnapshot } from "@/server/intelligence/capability";
import type { AuthoritySnapshot } from "@/server/intelligence/authority";
import {
  classifyExplicitConfirmation,
  guardTransactionTool,
  transactionToolNames,
  transactionToolRegistry,
} from "@/server/intelligence/transaction-tools";

const organizationId = "11111111-1111-4111-8111-111111111111";
const storeId = "22222222-2222-4222-8222-222222222222";
const conversationId = "33333333-3333-4333-8333-333333333333";
const contactId = "44444444-4444-4444-8444-444444444444";
const customerId = "55555555-5555-4555-8555-555555555555";
const orderId = "66666666-6666-4666-8666-666666666666";
const otherStoreId = "77777777-7777-4777-8777-777777777777";

function context(mode: "bot" | "waiting_agent" | "human" = "bot", trust: "weak" | "verified" = "verified") {
  return createIntelligenceContext({
    requestId: "req-int11",
    correlationId: "corr-int11",
    organizationId,
    storeId,
    channel: "whatsapp",
    businessType: "restaurant",
    actor: { type: "customer", userId: null },
    audience: "customer",
    conversation: { id: conversationId, mode },
    identity: {
      source: "whatsapp_contact",
      trust,
      contactId,
      customerId: trust === "verified" ? customerId : null,
    },
    activeReferences: { cartId: null, orderId },
    external: { provider: null, accountId: null },
    authority: { resolved: false, key: null },
    capabilities: { resolved: false, revision: null },
  });
}

function capabilities(overrides: Partial<Record<"canCreateOrder" | "canMutateOrder" | "canOfferPix", boolean>> = {}): CapabilitySnapshot {
  const decision = (capability: "canCreateOrder" | "canMutateOrder" | "canOfferPix", allowed: boolean) => ({
    capability,
    allowed,
    reasons: allowed ? ["allowed" as const] : ["feature_disabled" as const],
    requiresAuthority: capability === "canMutateOrder",
  });
  return {
    organizationId,
    storeId,
    businessType: "restaurant",
    revision: "int11-test",
    decisions: {
      canAutoReply: { capability: "canAutoReply", allowed: true, reasons: ["allowed"], requiresAuthority: false },
      canSearchCatalog: { capability: "canSearchCatalog", allowed: true, reasons: ["allowed"], requiresAuthority: false },
      canCreateOrder: decision("canCreateOrder", overrides.canCreateOrder ?? true),
      canQuoteDelivery: { capability: "canQuoteDelivery", allowed: true, reasons: ["allowed"], requiresAuthority: false },
      canTrackDelivery: { capability: "canTrackDelivery", allowed: true, reasons: ["allowed"], requiresAuthority: false },
      canShowGrowthBenefits: { capability: "canShowGrowthBenefits", allowed: true, reasons: ["allowed"], requiresAuthority: false },
      canRedeemGrowthBenefits: { capability: "canRedeemGrowthBenefits", allowed: true, reasons: ["allowed"], requiresAuthority: false },
      canOfferPix: decision("canOfferPix", overrides.canOfferPix ?? true),
      canMutateOrder: decision("canMutateOrder", overrides.canMutateOrder ?? true),
      canViewOperationalHealth: { capability: "canViewOperationalHealth", allowed: true, reasons: ["allowed"], requiresAuthority: false },
    },
  };
}

function authority(cancelAllowed = true): AuthoritySnapshot {
  const make = (operation: keyof AuthoritySnapshot["decisions"], allowed = true) => ({
    operation,
    allowed,
    route: allowed ? "local" as const : "deny" as const,
    reason: allowed ? "allowed_local" as const : "scope_mismatch" as const,
    requiredProviderCommand: null,
    confirmed: allowed,
  });
  return {
    key: `internal:${orderId}:pedeaqui`,
    organizationId,
    storeId,
    orderId,
    orderAuthority: "pedeaqui",
    paymentAuthority: "pedeaqui",
    logisticsAuthority: "pedeaqui",
    provider: null,
    integrationAccountId: null,
    syncStatus: null,
    confirmationState: "confirmed",
    allowedLocalOperations: [],
    decisions: {
      view_order: make("view_order"),
      confirm_order: make("confirm_order"),
      start_production: make("start_production"),
      mark_ready: make("mark_ready"),
      cancel_order: make("cancel_order", cancelAllowed),
      mark_paid: make("mark_paid"),
      offer_pedeaqui_pix: make("offer_pedeaqui_pix"),
      assign_delivery: make("assign_delivery"),
      advance_delivery: make("advance_delivery"),
    },
  };
}

describe("INT-11 transaction tools", () => {
  it("classifies explicit confirmation conservatively", () => {
    expect(classifyExplicitConfirmation("SIM! ")).toBe("confirmed");
    expect(classifyExplicitConfirmation("confirmo")).toBe("confirmed");
    expect(classifyExplicitConfirmation("não")).toBe("rejected");
    expect(classifyExplicitConfirmation("cancelar")).toBe("rejected");
    expect(classifyExplicitConfirmation("acho que sim")).toBe("ambiguous");
    expect(classifyExplicitConfirmation(" ")).toBe("missing");
  });

  it("requires unequivocal confirmation for order.create", () => {
    for (const confirmation of ["missing", "ambiguous", "rejected"] as const) {
      expect(guardTransactionTool({
        context: context(),
        tool: "order.create",
        capabilitySnapshot: capabilities(),
        confirmation,
      }).allowed).toBe(false);
    }
    expect(guardTransactionTool({
      context: context(),
      tool: "order.create",
      capabilitySnapshot: capabilities(),
      confirmation: "confirmed",
    })).toMatchObject({ allowed: true, reasons: ["allowed"] });
  });

  it("requires an idempotency key for mutable cart preparation", () => {
    expect(guardTransactionTool({
      context: context(),
      tool: "cart.addItem",
      capabilitySnapshot: capabilities(),
    })).toMatchObject({ allowed: false, reasons: expect.arrayContaining(["idempotency_key_required"]) });

    expect(guardTransactionTool({
      context: context(),
      tool: "cart.addItem",
      capabilitySnapshot: capabilities(),
      idempotencyKey: "wa:req-int11:cart:add:1",
    }).allowed).toBe(true);
  });

  it("honors human lock and capability denial", () => {
    expect(guardTransactionTool({
      context: context("human"),
      tool: "order.create",
      capabilitySnapshot: capabilities(),
      confirmation: "confirmed",
    }).reasons).toContain("human_lock");

    expect(guardTransactionTool({
      context: context(),
      tool: "order.create",
      capabilitySnapshot: capabilities({ canCreateOrder: false }),
      confirmation: "confirmed",
    }).reasons).toContain("capability_denied");
  });

  it("blocks an order cancellation when canonical authority denies it", () => {
    const decision = guardTransactionTool({
      context: context(),
      tool: "order.requestCancellation",
      capabilitySnapshot: capabilities(),
      authoritySnapshot: authority(false),
      confirmation: "confirmed",
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reasons).toContain("authority_denied");
  });

  it("rejects capability and authority snapshots from another store", () => {
    const foreignCapabilities = { ...capabilities(), storeId: otherStoreId };
    const createDecision = guardTransactionTool({
      context: context(),
      tool: "order.create",
      capabilitySnapshot: foreignCapabilities,
      confirmation: "confirmed",
    });
    expect(createDecision.allowed).toBe(false);
    expect(createDecision.reasons).toContain("scope_mismatch");

    const foreignAuthority = { ...authority(), storeId: otherStoreId };
    const cancelDecision = guardTransactionTool({
      context: context(),
      tool: "order.requestCancellation",
      capabilitySnapshot: capabilities(),
      authoritySnapshot: foreignAuthority,
      confirmation: "confirmed",
    });
    expect(cancelDecision.allowed).toBe(false);
    expect(cancelDecision.reasons).toContain("scope_mismatch");
  });

  it("keeps every mutable tool declarative and bound to canonical contracts", () => {
    expect(Object.keys(transactionToolRegistry).sort()).toEqual([...transactionToolNames].sort());
    for (const name of transactionToolNames) {
      const contract = transactionToolRegistry[name];
      expect(contract.name).toBe(name);
      expect(contract.audience.length).toBeGreaterThan(0);
      expect(contract.canonicalService.trim().length).toBeGreaterThan(0);
      expect(contract.auditEvent).toMatch(/^intelligence\.transaction\./);
      if (contract.mutationLevel === "N2") expect(contract.confirmation).toBe("explicit");
    }
  });

  it("creates WhatsApp orders through the canonical channel contract without a post-create orders update", () => {
    const whatsappSource = readFileSync("src/server/conversations/whatsapp-order-service.ts", "utf8");
    const orderSource = readFileSync("src/server/orders/order-service.ts", "utf8");
    const migration = readFileSync("supabase/migrations/20260915155500_int11_order_creation_channel.sql", "utf8");

    expect(whatsappSource).toContain('OrderService.createFromCheckout(input.storeSlug, context.cartToken, "whatsapp")');
    expect(whatsappSource).not.toMatch(/from\(["']orders["']\)\.update\(\{\s*channel:\s*["']whatsapp["']/);
    expect(orderSource).toContain('channel: OrderCreationChannel = "digital_menu"');
    expect(orderSource).toContain("p_channel: channel");
    expect(migration).toContain("p_channel text");
    expect(migration).toContain("p_channel not in ('digital_menu','whatsapp')");
    expect(migration).toContain("'digital_menu'::text");
    expect(migration).not.toMatch(/\bupdate\s+public\.orders\b/i);
  });
});
