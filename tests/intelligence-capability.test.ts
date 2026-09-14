import { describe, expect, it } from "vitest";
import { MODULE_KEYS, type BusinessType, type ModuleKey } from "@/modules/module-catalog";
import type { ModuleAvailabilityReason } from "@/modules/module-access";
import { CapabilitySnapshotResolver, type CapabilityFacts } from "@/server/intelligence/capability";
import { createIntelligenceContext, type ConversationMode } from "@/server/intelligence/context";

const organizationId = "40000000-0000-4000-8000-000000000001";
const storeId = "40000000-0000-4000-8000-000000000002";

function context(mode: ConversationMode = "bot", overrides: { organizationId?: string; storeId?: string } = {}) {
  return createIntelligenceContext({
    requestId: "req", correlationId: "corr", organizationId: overrides.organizationId ?? organizationId,
    storeId: overrides.storeId ?? storeId, channel: "whatsapp", businessType: "restaurant",
    actor: { type: "customer", userId: null }, audience: "customer", conversation: { id: null, mode },
    identity: { source: "anonymous", trust: "none", contactId: null, customerId: null },
    activeReferences: { cartId: null, orderId: null }, external: { provider: null, accountId: null },
    authority: { resolved: false, key: null }, capabilities: { resolved: false, revision: null },
  });
}

function facts(overrides: Partial<CapabilityFacts> = {}): CapabilityFacts {
  const modules = Object.fromEntries(MODULE_KEYS.map((key) => [key, {
    available: true, reason: "available" as const, missingDependencies: [],
  }])) as unknown as Record<ModuleKey, { available: boolean; reason: ModuleAvailabilityReason; missingDependencies: ModuleKey[] }>;
  return {
    organizationId, storeId, businessType: "restaurant", storeStatus: "active", modules,
    permissions: new Set(["orders.create", "orders.edit", "growth.manage", "dashboard.view"]),
    featureFlags: {}, providerReadiness: {}, operationalConfig: {}, revision: "modules:2/config:1",
    ...overrides,
  };
}

describe("CapabilitySnapshotResolver", () => {
  it("allows the complete healthy shadow snapshot and marks mutations as authority-bound", () => {
    const snapshot = CapabilitySnapshotResolver.resolve(context(), facts());
    expect(Object.values(snapshot.decisions).every((decision) => decision.allowed)).toBe(true);
    expect(snapshot.decisions.canMutateOrder.requiresAuthority).toBe(true);
    expect(snapshot.decisions.canCreateOrder.requiresAuthority).toBe(false);
  });

  it.each([
    ["disabled_by_store", "module_disabled_by_store"],
    ["not_supported_by_profile", "module_not_supported_by_profile"],
    ["missing_dependency", "module_missing_dependency"],
    ["not_in_plan", "module_not_in_plan"],
    ["permission_denied", "module_permission_denied"],
    ["temporarily_unavailable", "module_temporarily_unavailable"],
  ] as const)("preserves module blocker %s as a structured reason", (reason, expected) => {
    const current = facts();
    const modules = { ...current.modules, growth: { available: false, reason, missingDependencies: reason === "missing_dependency" ? ["customers"] as ModuleKey[] : [] } };
    const decision = CapabilitySnapshotResolver.resolve(context(), { ...current, modules }).decisions.canShowGrowthBenefits;
    expect(decision).toMatchObject({ allowed: false, reasons: [expected] });
  });

  it("requires entitlement/module decision and explicit RBAC instead of a frontend flag", () => {
    const current = facts({ featureFlags: { canRedeemGrowthBenefits: true }, permissions: new Set() });
    const modules = { ...current.modules, growth: { available: false, reason: "not_in_plan" as const, missingDependencies: [] } };
    expect(CapabilitySnapshotResolver.resolve(context(), { ...current, modules }).decisions.canRedeemGrowthBenefits)
      .toMatchObject({ allowed: false, reasons: ["module_not_in_plan", "permission_denied"] });
  });

  it.each(["human", "waiting_agent", "closed", "none"] as const)("forces auto reply off in %s mode", (mode) => {
    expect(CapabilitySnapshotResolver.resolve(context(mode), facts()).decisions.canAutoReply)
      .toMatchObject({ allowed: false, reasons: ["conversation_not_bot"] });
  });

  it("fails closed on tenant/store mismatch", () => {
    const otherStore = "40000000-0000-4000-8000-000000000099";
    const decision = CapabilitySnapshotResolver.resolve(context("bot", { storeId: otherStore }), facts()).decisions.canSearchCatalog;
    expect(decision).toMatchObject({ allowed: false, reasons: ["scope_mismatch"] });
  });

  it("keeps safe reads while temporarily closed but blocks transactional capabilities", () => {
    const snapshot = CapabilitySnapshotResolver.resolve(context(), facts({ storeStatus: "temporarily_closed" }));
    expect(snapshot.decisions.canSearchCatalog.allowed).toBe(true);
    expect(snapshot.decisions.canViewOperationalHealth.allowed).toBe(true);
    expect(snapshot.decisions.canCreateOrder.reasons).toContain("store_temporarily_closed");
    expect(snapshot.decisions.canOfferPix.reasons).toContain("store_temporarily_closed");
  });

  it("blocks only provider-dependent capabilities when disconnected or unhealthy", () => {
    const snapshot = CapabilitySnapshotResolver.resolve(context(), facts({
      providerReadiness: { canOfferPix: "disconnected", canTrackDelivery: "error" },
    }));
    expect(snapshot.decisions.canOfferPix.reasons).toContain("provider_disconnected");
    expect(snapshot.decisions.canTrackDelivery.reasons).toContain("provider_unhealthy");
    expect(snapshot.decisions.canSearchCatalog.allowed).toBe(true);
  });

  it("keeps checkout delivery quote independent from managed delivery operations", () => {
    const current = facts();
    const modules = { ...current.modules, deliveries: { available: false, reason: "disabled_by_store" as const, missingDependencies: [] } };
    const snapshot = CapabilitySnapshotResolver.resolve(context(), { ...current, modules });
    expect(snapshot.decisions.canQuoteDelivery.allowed).toBe(true);
    expect(snapshot.decisions.canTrackDelivery.reasons).toContain("module_disabled_by_store");
  });

  it("combines feature, operation and store blockers without hiding any reason", () => {
    const snapshot = CapabilitySnapshotResolver.resolve(context(), facts({
      storeStatus: "inactive",
      featureFlags: { canCreateOrder: false },
      operationalConfig: { canCreateOrder: false },
      permissions: new Set(),
    }));
    expect(snapshot.decisions.canCreateOrder.reasons).toEqual([
      "feature_disabled", "store_inactive", "permission_denied", "operational_config_disabled",
    ]);
  });

  it("keeps business type as a canonical module decision, not a parallel guess", () => {
    const current = facts({ businessType: "gas" as BusinessType });
    const modules = { ...current.modules, growth: { available: false, reason: "not_supported_by_profile" as const, missingDependencies: [] } };
    const snapshot = CapabilitySnapshotResolver.resolve(context(), { ...current, modules });
    expect(snapshot.businessType).toBe("gas");
    expect(snapshot.decisions.canShowGrowthBenefits.reasons).toContain("module_not_supported_by_profile");
  });
});
