import { describe, expect, it } from "vitest";
import {
  BUSINESS_TYPES,
  MODULE_CATALOG,
  MODULE_KEYS,
  modulesForPreset,
  profileSupportsModule,
  validateModuleCatalog,
  type ModuleKey,
} from "@/modules/module-catalog";
import { resolveModuleAvailability } from "@/modules/module-access";
import { planModuleActivation, planModuleDeactivation } from "@/modules/module-lifecycle";
import { resolveModuleRbac } from "@/modules/module-rbac";
import { executeModuleResolverRollout } from "@/modules/module-rollout";
import { selectEasyModuleKeys } from "@/modules/user-experience";

describe("modular contract regression matrix", () => {
  it("keeps catalog invariants valid", () => {
    expect(validateModuleCatalog()).toEqual([]);
    expect(new Set(MODULE_KEYS).size).toBe(MODULE_KEYS.length);
  });

  for (const businessType of BUSINESS_TYPES) {
    for (const preset of ["essential", "complete", "custom"] as const) {
      it(`${businessType}/${preset} contains only known modules supported by the profile`, () => {
        const modules = modulesForPreset(businessType, preset, preset === "custom" ? ["pdv"] : []);
        for (const moduleKey of modules) {
          expect(MODULE_KEYS).toContain(moduleKey);
          expect(profileSupportsModule(businessType, moduleKey)).toBe(true);
        }
      });
    }
  }

  it("requires module + permission + entitlement + dependencies together", () => {
    const definition = MODULE_CATALOG.deliveries;
    const active = new Set<ModuleKey>(["orders", "deliveries"]);
    const permission = definition.permissionsAny[0];
    if (!permission) throw new Error("deliveries must declare a permission");

    expect(resolveModuleAvailability({ definition, businessType: "restaurant", storeEnabled: true, activeModuleKeys: active, grantedPermissions: new Set(), entitlementAllowed: true }).reason).toBe("permission_denied");
    expect(resolveModuleAvailability({ definition, businessType: "restaurant", storeEnabled: false, activeModuleKeys: active, grantedPermissions: new Set([permission]), entitlementAllowed: true }).reason).toBe("disabled_by_store");
    expect(resolveModuleAvailability({ definition, businessType: "restaurant", storeEnabled: true, activeModuleKeys: active, grantedPermissions: new Set([permission]), entitlementAllowed: false }).reason).toBe("not_in_plan");
    expect(resolveModuleAvailability({ definition, businessType: "restaurant", storeEnabled: true, activeModuleKeys: new Set<ModuleKey>(["deliveries"]), grantedPermissions: new Set([permission]), entitlementAllowed: true }).reason).toBe("missing_dependency");
    expect(resolveModuleAvailability({ definition, businessType: "restaurant", storeEnabled: true, activeModuleKeys: active, grantedPermissions: new Set([permission]), entitlementAllowed: true }).available).toBe(true);
  });

  it("easy mode only prioritizes modules that were already authorized", () => {
    const authorized: ModuleKey[] = ["orders", "customers"];
    const easy = selectEasyModuleKeys(authorized, ["owner", "manager"]);
    expect(easy.every((moduleKey) => authorized.includes(moduleKey))).toBe(true);
    expect(easy).not.toContain("settings");
  });

  it("activation cascades declared dependencies and deactivation protects active dependents", () => {
    const activation = planModuleActivation({ moduleKey: "driver", businessType: "restaurant", enabledModuleKeys: new Set<ModuleKey>(["orders"]) });
    expect(activation.status).toBe("ready");
    expect(activation.changes.map((change) => change.moduleKey)).toEqual(expect.arrayContaining(["deliveries", "driver"]));

    const deactivation = planModuleDeactivation({ moduleKey: "deliveries", enabledModuleKeys: new Set<ModuleKey>(["orders", "deliveries", "driver"]) });
    expect(deactivation.status).toBe("blocked");
    expect(deactivation.blockers).toContainEqual(expect.objectContaining({ code: "active_dependent", relatedModuleKey: "driver" }));
  });

  it("blocks module shutdown when an operational blocker is present", () => {
    const result = planModuleDeactivation({ moduleKey: "deliveries", enabledModuleKeys: new Set<ModuleKey>(["orders", "deliveries"]), operationalBlockers: ["open_delivery"] });
    expect(result.status).toBe("blocked");
    expect(result.blockers).toContainEqual(expect.objectContaining({ code: "operational_blocker", detail: "open_delivery" }));
  });

  it("does not reuse a store-scoped grant across stores or tenants", () => {
    const definition = MODULE_CATALOG.orders;
    const permission = definition.permissionsAny[0];
    if (!permission) throw new Error("orders must declare a permission");
    const availability = { moduleKey: "orders" as const, available: true, reason: "available" as const, missingDependencies: [] };
    const grants = [{ permission, effect: "allow" as const, scope: "store" as const, organizationId: "tenant-a", storeId: "store-a", sourceId: "grant-a" }];

    expect(resolveModuleRbac({ moduleKey: "orders", availability, grants, context: { organizationId: "tenant-a", storeId: "store-a" } }).allowed).toBe(true);
    expect(resolveModuleRbac({ moduleKey: "orders", availability, grants, context: { organizationId: "tenant-a", storeId: "store-b" } }).allowed).toBe(false);
    expect(resolveModuleRbac({ moduleKey: "orders", availability, grants, context: { organizationId: "tenant-b", storeId: "store-a" } }).allowed).toBe(false);
  });

  it("proves existing restaurant equivalence while configuration read is in shadow", () => {
    const legacyNavigation = ["dashboard", "orders", "catalog"];
    const result = executeModuleResolverRollout({
      config: { enabled: true, shadow: true, storeIds: ["legacy-store"] },
      context: { organizationId: "legacy-org", storeId: "legacy-store" },
      legacy: () => legacyNavigation,
      next: () => ["dashboard", "orders"],
      compare: (legacy, next) => legacy.join("|") === next.join("|") ? undefined : "navigation_divergence",
    });
    expect(result.value).toEqual(legacyNavigation);
    expect(result.effectiveResolver).toBe("legacy");
    expect(result.divergence).toBe("navigation_divergence");
  });
});
