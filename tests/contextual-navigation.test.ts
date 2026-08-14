import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "@/server/access/permissions";
import { NAVIGATION_MODULES, contextsForRoleKeys, contextualNavigation, priorityForModule } from "@/components/layout/navigation-model";

describe("contextual navigation", () => {
  it("maps every bootstrap system role to an operational context", () => {
    expect(contextsForRoleKeys(["owner"])).toEqual(["management"]);
    expect(contextsForRoleKeys(["manager"])).toEqual(["manager"]);
    expect(contextsForRoleKeys(["cashier"])).toEqual(["cashier"]);
    expect(contextsForRoleKeys(["attendant"])).toEqual(["service"]);
    expect(contextsForRoleKeys(["waiter"])).toEqual(["floor"]);
    expect(contextsForRoleKeys(["kitchen"])).toEqual(["kitchen"]);
    expect(contextsForRoleKeys(["driver"])).toEqual(["delivery"]);
    expect(contextsForRoleKeys(["financial"])).toEqual(["administrative"]);
  });

  it("combines multiple contexts deterministically using the strongest priority", () => {
    const contexts = contextsForRoleKeys(["waiter", "cashier", "waiter"]);
    expect(contexts).toEqual(["floor", "cashier"]);
    expect(priorityForModule(contexts, "dining")).toBe("primary");
    expect(priorityForModule(contexts, "cash")).toBe("primary");
  });

  it("requires a granted permission before surfacing a tenant module", () => {
    const granted = new Set<string>([PERMISSIONS.ORDERS_VIEW]);
    const nav = contextualNavigation(["kitchen"], granted);
    expect(nav.map((item) => item.key)).toEqual(["orders", "production"]);
  });

  it("never treats platform access as an organization permission", () => {
    const allTenantPermissions = new Set<string>(Object.values(PERMISSIONS));
    expect(contextualNavigation(["management"], allTenantPermissions).some((item) => item.key === "platform")).toBe(false);
  });

  it("references only canonical permission constants for tenant modules", () => {
    const valid = new Set<string>(Object.values(PERMISSIONS));
    for (const module of NAVIGATION_MODULES) {
      if (module.authorization === "platform") continue;
      for (const permission of module.permissions) expect(valid.has(permission), `${module.key}:${permission}`).toBe(true);
    }
  });
});
