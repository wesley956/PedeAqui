import { describe, expect, it } from "vitest";
import { MODULE_CATALOG, type ModuleKey } from "@/modules/module-catalog";
import type { ModuleAvailability } from "@/modules/module-access";
import {
  canAccessModuleRoute,
  canNavigateToModule,
  resolveModuleRbac,
  type ModulePermissionGrant,
} from "@/modules/module-rbac";
import { planModuleRbacBackfill } from "@/modules/module-rbac-backfill";

const context = { organizationId: "org-a", storeId: "store-a" };
const moduleKey: ModuleKey = "orders";
const permission = MODULE_CATALOG[moduleKey].permissionsAny[0];

function availability(available: boolean): ModuleAvailability {
  return {
    moduleKey,
    available,
    reason: available ? "available" : "disabled_by_store",
    missingDependencies: [],
  };
}

function decide(grants: readonly ModulePermissionGrant[], available = true) {
  return resolveModuleRbac({ moduleKey, availability: availability(available), grants, context });
}

describe("module RBAC rollout", () => {
  it("denies unavailable modules before evaluating permissions", () => {
    const decision = decide([{ permission, effect: "allow", scope: "global", sourceId: "global-allow" }], false);
    expect(decision).toMatchObject({ allowed: false, visible: false, reason: "module_unavailable" });
  });

  it("denies by default when no matching permission exists", () => {
    expect(decide([])).toMatchObject({ allowed: false, visible: false, reason: "permission_denied" });
  });

  it("accepts a matching store permission", () => {
    const decision = decide([{
      permission,
      effect: "allow",
      scope: "store",
      organizationId: "org-a",
      storeId: "store-a",
      sourceId: "store-allow",
    }]);
    expect(decision).toMatchObject({ allowed: true, visible: true, reason: "allowed" });
    expect(canNavigateToModule(decision)).toBe(true);
    expect(canAccessModuleRoute(decision)).toBe(true);
  });

  it("uses deny as deterministic tie-break at the same specificity", () => {
    const decision = decide([
      { permission, effect: "allow", scope: "organization", organizationId: "org-a", sourceId: "a" },
      { permission, effect: "deny", scope: "organization", organizationId: "org-a", sourceId: "z" },
    ]);
    expect(decision.allowed).toBe(false);
    expect(decision.permissionTrace[0]).toMatchObject({ effect: "deny", scope: "organization" });
  });

  it("lets a more specific store allow override a broader organization deny", () => {
    const decision = decide([
      { permission, effect: "deny", scope: "organization", organizationId: "org-a", sourceId: "org-deny" },
      { permission, effect: "allow", scope: "store", organizationId: "org-a", storeId: "store-a", sourceId: "store-allow" },
    ]);
    expect(decision.allowed).toBe(true);
    expect(decision.permissionTrace[0]).toMatchObject({ effect: "allow", scope: "store" });
  });

  it("ignores grants from another organization or store", () => {
    const decision = decide([
      { permission, effect: "allow", scope: "organization", organizationId: "org-b", sourceId: "wrong-org" },
      { permission, effect: "allow", scope: "store", organizationId: "org-a", storeId: "store-b", sourceId: "wrong-store" },
    ]);
    expect(decision.allowed).toBe(false);
  });

  it("keeps navigation and route access derived from the same decision", () => {
    const denied = decide([]);
    expect(canNavigateToModule(denied)).toBe(false);
    expect(canAccessModuleRoute(denied)).toBe(false);
  });
});

describe("module RBAC backfill planner", () => {
  it("never converts null legacy state into permission", () => {
    const plan = planModuleRbacBackfill([{
      moduleKey,
      permission,
      organizationId: "org-a",
      allowed: null,
      sourceId: "legacy-null",
    }]);
    expect(plan.grants).toEqual([]);
    expect(plan.skippedSourceIds).toEqual(["legacy-null"]);
  });

  it("collapses exact-scope conflicts to deny and keeps rollback trace", () => {
    const plan = planModuleRbacBackfill([
      { moduleKey, permission, organizationId: "org-a", storeId: "store-a", allowed: true, sourceId: "legacy-allow" },
      { moduleKey, permission, organizationId: "org-a", storeId: "store-a", allowed: false, sourceId: "legacy-deny" },
    ]);
    expect(plan.grants).toHaveLength(1);
    expect(plan.grants[0]).toMatchObject({ effect: "deny", scope: "store", organizationId: "org-a", storeId: "store-a" });
    expect(plan.rollbackSourceIds).toEqual(["legacy-allow", "legacy-deny"]);
  });

  it("is deterministic and idempotent as a dry-run plan", () => {
    const assignments = [
      { moduleKey, permission, organizationId: "org-a", allowed: true, sourceId: "b" },
      { moduleKey, permission, organizationId: "org-a", allowed: true, sourceId: "a" },
    ] as const;
    expect(planModuleRbacBackfill(assignments)).toEqual(planModuleRbacBackfill([...assignments].reverse()));
  });
});
