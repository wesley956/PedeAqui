import { describe, expect, it } from "vitest";
import {
  assertEvidenceIsSafe,
  evaluateRolloutReadiness,
  type RolloutEvidence,
  type RolloutScenario,
} from "@/server/integrations/rollout/rollout-gate";
import {
  isProductionCapabilityApproved,
  productionCapabilityApprovalsForStore,
  withProductionCapabilityApproval,
} from "@/server/integrations/rollout/production-capability-approval";

function evidence(scenario: RolloutScenario, overrides: Partial<RolloutEvidence> = {}): RolloutEvidence {
  return {
    scenario,
    passed: true,
    environment: scenario === "provider_sandbox" ? "sandbox" : "production",
    buildCommit: "abcdef1",
    evidenceRef: `qa-${scenario}`,
    provider: "ifood",
    capability: "ifood_orders",
    storeId: "store-a",
    merchantRefSanitized: "sandbox-merchant-001",
    externalOrderRefSanitized: "sandbox-order-001",
    internalOrderId: "11111111-1111-4111-8111-111111111111",
    eventTypes: ["PLACED", "CONFIRMED"],
    actions: ["confirm", "startPreparation"],
    printJobId: "22222222-2222-4222-8222-222222222222",
    divergenceCount: 0,
    duplicates: { orders: 0, prints: 0, charges: 0, deliveries: 0 },
    nativeIsolationPassed: true,
    tenantIsolationPassed: true,
    recordedAt: "2026-09-08T06:00:00.000Z",
    ...overrides,
  };
}

const baseEvidence = [
  "native_baseline",
  "core_resilience",
  "structural_integrity",
  "provider_sandbox",
  "official_homologation",
  "security",
].map((scenario) => evidence(scenario as RolloutScenario));

describe("#949 controlled omnichannel rollout gate", () => {
  it("scopes production approval by store and refuses the old account-wide shape", () => {
    const legacy = { production_capability_approvals: { ifood_orders: true } };
    expect(isProductionCapabilityApproved(legacy, "store-a", "ifood_orders")).toBe(false);

    const scoped = withProductionCapabilityApproval({}, "store-a", "ifood_orders", true);
    expect(isProductionCapabilityApproved(scoped, "store-a", "ifood_orders")).toBe(true);
    expect(isProductionCapabilityApproved(scoped, "store-b", "ifood_orders")).toBe(false);
    expect(productionCapabilityApprovalsForStore(scoped, "store-b")).toEqual({});
  });

  it("blocks a canary until every native/core/#950/sandbox/homologation/security scenario passed", () => {
    const readiness = evaluateRolloutReadiness({
      provider: "ifood",
      capability: "ifood_orders",
      storeId: "store-a",
      target: "canary",
      evidence: baseEvidence.filter((item) => item.scenario !== "official_homologation"),
    });
    expect(readiness.ready).toBe(false);
    expect(readiness.missingScenarios).toContain("official_homologation");
    expect(readiness.missingScenarios).not.toContain("structural_integrity");
  });

  it("allows objective canary readiness but still requires a separate explicit approval action", () => {
    const readiness = evaluateRolloutReadiness({
      provider: "ifood",
      capability: "ifood_orders",
      storeId: "store-a",
      target: "canary",
      evidence: baseEvidence,
    });
    expect(readiness.ready).toBe(true);
    expect(readiness.requiresExplicitApproval).toBe(true);
    expect(readiness.blockers).toEqual([]);
  });

  it("treats any duplicate order/print/charge/delivery as a P0 rollout blocker", () => {
    const readiness = evaluateRolloutReadiness({
      provider: "ifood",
      capability: "ifood_orders",
      storeId: "store-a",
      target: "canary",
      evidence: baseEvidence.map((item) => item.scenario === "core_resilience"
        ? { ...item, duplicates: { ...item.duplicates, prints: 1 } }
        : item),
    });
    expect(readiness.ready).toBe(false);
    expect(readiness.p0DuplicateDetected).toBe(true);
    expect(readiness.blockers.join(" ")).toContain("P0");
  });

  it("blocks expansion when native or tenant isolation was not proved", () => {
    const readiness = evaluateRolloutReadiness({
      provider: "ifood",
      capability: "ifood_orders",
      storeId: "store-a",
      target: "canary",
      evidence: baseEvidence.map((item) => item.scenario === "core_resilience"
        ? { ...item, nativeIsolationPassed: false, tenantIsolationPassed: false }
        : item),
    });
    expect(readiness.ready).toBe(false);
    expect(readiness.blockers.join(" ")).toContain("canal nativo");
    expect(readiness.blockers.join(" ")).toContain("tenants");
  });

  it("requires observed canary plus real rollback before general rollout", () => {
    const beforeCanary = evaluateRolloutReadiness({
      provider: "ifood",
      capability: "ifood_orders",
      storeId: "store-a",
      target: "general",
      evidence: baseEvidence,
    });
    expect(beforeCanary.ready).toBe(false);
    expect(beforeCanary.missingScenarios).toEqual(expect.arrayContaining(["canary_observation", "rollback_verified"]));

    const afterCanary = evaluateRolloutReadiness({
      provider: "ifood",
      capability: "ifood_orders",
      storeId: "store-a",
      target: "general",
      evidence: [...baseEvidence, evidence("canary_observation"), evidence("rollback_verified")],
    });
    expect(afterCanary.ready).toBe(true);
    expect(afterCanary.requiresExplicitApproval).toBe(true);
  });

  it("never makes iFood Catalog releaseable while catalogs/prices are intentionally independent", () => {
    const catalogEvidence = baseEvidence.map((item) => ({ ...item, capability: "ifood_catalog" }));
    const readiness = evaluateRolloutReadiness({
      provider: "ifood",
      capability: "ifood_catalog",
      storeId: "store-a",
      target: "canary",
      evidence: catalogEvidence,
    });
    expect(readiness.ready).toBe(false);
    expect(readiness.blockers.join(" ")).toContain("decisão de produto");
  });

  it("rejects evidence references that look like secrets/PII and accepts sanitized QA evidence", () => {
    expect(() => assertEvidenceIsSafe(evidence("provider_sandbox"))).not.toThrow();
    expect(() => assertEvidenceIsSafe(evidence("provider_sandbox", { evidenceRef: "token=abc123" }))).toThrow(/forbidden/i);
  });
});
