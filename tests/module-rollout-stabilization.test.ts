import { describe, expect, it, vi } from "vitest";
import {
  executeModuleResolverRollout,
  moduleRolloutBucket,
  resolveModuleRollout,
} from "@/modules/module-rollout";

const context = { organizationId: "org-a", storeId: "store-a", cohort: "pilot" };

describe("modular resolver rollout", () => {
  it("defaults to legacy and lets rollback override every target", () => {
    expect(resolveModuleRollout(undefined, context)).toEqual({ mode: "legacy", selected: false, reason: "disabled" });
    expect(resolveModuleRollout({ enabled: true, rollbackToLegacy: true, storeIds: ["store-a"], percentage: 100 }, context))
      .toEqual({ mode: "legacy", selected: false, reason: "rollback" });
  });

  it("targets store, organization and cohort in deterministic precedence", () => {
    expect(resolveModuleRollout({ enabled: true, storeIds: ["store-a"], organizationIds: ["org-a"], cohorts: ["pilot"] }, context).reason).toBe("store_target");
    expect(resolveModuleRollout({ enabled: true, organizationIds: ["org-a"], cohorts: ["pilot"] }, context).reason).toBe("organization_target");
    expect(resolveModuleRollout({ enabled: true, cohorts: ["pilot"] }, context).reason).toBe("cohort_target");
  });

  it("uses stable percentage bucketing instead of random selection", () => {
    expect(moduleRolloutBucket("org-a:store-a")).toBe(moduleRolloutBucket("org-a:store-a"));
    expect(resolveModuleRollout({ enabled: true, percentage: 100 }, context)).toMatchObject({ mode: "new", selected: true, reason: "percentage_target" });
    expect(resolveModuleRollout({ enabled: true, percentage: 0 }, context)).toEqual({ mode: "legacy", selected: false, reason: "not_targeted" });
  });

  it("shadow computes both resolvers but always returns the legacy value", () => {
    const diagnostics = vi.fn();
    const legacy = vi.fn(() => ({ allowed: true }));
    const next = vi.fn(() => ({ allowed: false }));
    const result = executeModuleResolverRollout({
      config: { enabled: true, shadow: true, storeIds: ["store-a"] },
      context,
      legacy,
      next,
      compare: (before, after) => before.allowed === after.allowed ? undefined : "availability_changed",
      onDiagnostic: diagnostics,
    });
    expect(result.value).toEqual({ allowed: true });
    expect(result.effectiveResolver).toBe("legacy");
    expect(result.divergence).toBe("availability_changed");
    expect(legacy).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledOnce();
    expect(diagnostics).toHaveBeenCalledWith(expect.objectContaining({ mode: "shadow", divergence: "availability_changed" }));
  });

  it("legacy mode never invokes the next resolver", () => {
    const next = vi.fn(() => "new");
    const result = executeModuleResolverRollout({ config: { enabled: false }, context, legacy: () => "legacy", next });
    expect(result.value).toBe("legacy");
    expect(next).not.toHaveBeenCalled();
  });

  it("new mode uses the new resolver and falls back safely when it fails", () => {
    const successful = executeModuleResolverRollout({
      config: { enabled: true, storeIds: ["store-a"] }, context, legacy: () => "legacy", next: () => "new",
    });
    expect(successful).toMatchObject({ value: "new", effectiveResolver: "new", fallbackUsed: false });

    const fallback = executeModuleResolverRollout({
      config: { enabled: true, storeIds: ["store-a"] },
      context,
      legacy: () => "legacy",
      next: () => { throw new Error("resolver unavailable"); },
    });
    expect(fallback).toMatchObject({ value: "legacy", effectiveResolver: "legacy", fallbackUsed: true });
  });
});
