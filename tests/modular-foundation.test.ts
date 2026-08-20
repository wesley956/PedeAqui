import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  BUSINESS_TYPES,
  CORE_MODULE_KEYS,
  MODULE_CATALOG,
  MODULE_KEYS,
  modulesForPreset,
  validateModuleCatalog,
} from "@/modules/module-catalog";
import { resolveModuleAvailability } from "@/modules/module-access";
import { planModuleActivation, planModuleDeactivation } from "@/modules/module-lifecycle";
import { PERMISSIONS } from "@/server/access/permissions";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("modular foundation [352]-[356]", () => {
  it("keeps the module catalog internally consistent and acyclic", () => {
    expect(validateModuleCatalog()).toEqual([]);
    expect(new Set(MODULE_KEYS).size).toBe(MODULE_KEYS.length);
    for (const key of CORE_MODULE_KEYS) expect(MODULE_CATALOG[key].canDisable).toBe(false);
  });

  it("defines all initial profiles and keeps dining out of gas/generic presets", () => {
    expect(BUSINESS_TYPES).toEqual(["restaurant", "gas", "generic_commerce"]);
    expect(modulesForPreset("restaurant", "complete")).toContain("dining");
    expect(modulesForPreset("gas", "complete")).not.toContain("dining");
    expect(modulesForPreset("generic_commerce", "complete")).not.toContain("dining");
    for (const profile of BUSINESS_TYPES) {
      for (const core of CORE_MODULE_KEYS) expect(modulesForPreset(profile, "essential")).toContain(core);
    }
  });

  it("keeps custom preset constrained to core plus supported explicit modules", () => {
    const custom = modulesForPreset("gas", "custom", ["inventory", "dining"]);
    expect(custom).toContain("inventory");
    expect(custom).not.toContain("dining");
    for (const core of CORE_MODULE_KEYS) expect(custom).toContain(core);
  });

  it("resolves module, plan, dependency and RBAC as independent gates", () => {
    const definition = MODULE_CATALOG.deliveries;
    const active = new Set(["dashboard", "orders", "catalog", "customers", "settings", "deliveries"] as const);
    const permissions = new Set<string>([PERMISSIONS.DELIVERY_VIEW]);

    expect(resolveModuleAvailability({ definition, businessType: "gas", storeEnabled: true, activeModuleKeys: active, grantedPermissions: permissions, entitlementAllowed: true }).reason).toBe("available");
    expect(resolveModuleAvailability({ definition, businessType: "gas", storeEnabled: false, activeModuleKeys: active, grantedPermissions: permissions, entitlementAllowed: true }).reason).toBe("disabled_by_store");
    expect(resolveModuleAvailability({ definition, businessType: "gas", storeEnabled: true, activeModuleKeys: new Set(), grantedPermissions: permissions, entitlementAllowed: true }).reason).toBe("missing_dependency");
    expect(resolveModuleAvailability({ definition, businessType: "gas", storeEnabled: true, activeModuleKeys: active, grantedPermissions: permissions, entitlementAllowed: false }).reason).toBe("not_in_plan");
    expect(resolveModuleAvailability({ definition, businessType: "gas", storeEnabled: true, activeModuleKeys: active, grantedPermissions: new Set(), entitlementAllowed: true }).reason).toBe("permission_denied");
  });

  it("rejects dining for a gas profile even if the store flag and permission are forged", () => {
    const result = resolveModuleAvailability({
      definition: MODULE_CATALOG.dining,
      businessType: "gas",
      storeEnabled: true,
      activeModuleKeys: new Set(MODULE_KEYS),
      grantedPermissions: new Set([PERMISSIONS.DINING_VIEW]),
      entitlementAllowed: true,
    });
    expect(result.available).toBe(false);
    expect(result.reason).toBe("not_supported_by_profile");
  });

  it("activates declared dependencies and blocks unsupported/plan-gated activation", () => {
    const enabled = new Set(CORE_MODULE_KEYS);
    const driver = planModuleActivation({ moduleKey: "driver", businessType: "gas", enabledModuleKeys: enabled });
    expect(driver.status).toBe("ready");
    expect(driver.changes.map((change) => change.moduleKey)).toEqual(["deliveries", "driver"]);

    const dining = planModuleActivation({ moduleKey: "dining", businessType: "gas", enabledModuleKeys: enabled });
    expect(dining.status).toBe("blocked");
    expect(dining.blockers[0]?.code).toBe("unsupported_profile");

    const inventory = planModuleActivation({ moduleKey: "inventory", businessType: "gas", enabledModuleKeys: enabled, modulesBlockedByPlan: new Set(["inventory"]) });
    expect(inventory.status).toBe("blocked");
    expect(inventory.blockers[0]?.code).toBe("not_in_plan");
  });

  it("never disables core, active dependencies or modules with operational blockers", () => {
    const all = new Set(MODULE_KEYS);
    expect(planModuleDeactivation({ moduleKey: "orders", enabledModuleKeys: all }).blockers.some((item) => item.code === "core_module")).toBe(true);
    expect(planModuleDeactivation({ moduleKey: "deliveries", enabledModuleKeys: all }).blockers.some((item) => item.relatedModuleKey === "driver")).toBe(true);
    expect(planModuleDeactivation({ moduleKey: "cash", enabledModuleKeys: new Set([...CORE_MODULE_KEYS, "cash"]), operationalBlockers: ["cash_session_open"] }).blockers.some((item) => item.code === "operational_blocker")).toBe(true);
  });

  it("makes repeated lifecycle requests idempotent", () => {
    const enabled = new Set([...CORE_MODULE_KEYS, "inventory"] as const);
    expect(planModuleActivation({ moduleKey: "inventory", businessType: "restaurant", enabledModuleKeys: enabled }).changes).toEqual([]);
    expect(planModuleDeactivation({ moduleKey: "finance", enabledModuleKeys: enabled }).changes).toEqual([]);
  });

  it("versions a backward-compatible multi-tenant persistence contract", () => {
    const sql = read("supabase/sql/105_modular_foundation.sql");
    expect(sql).toContain("create table if not exists public.store_modules");
    expect(sql).toContain("foreign key (organization_id, store_id)");
    expect(sql).toContain("private.can_access_store(organization_id, store_id)");
    expect(sql).toContain("configuration_source");
    expect(sql).toContain("module_config_revision");
    expect(sql).toContain("module configuration revision conflict");
    expect(sql).toContain("store_modules_core_enabled_check");
    expect(sql).toContain("on conflict (store_id, module_key) do nothing");
    expect(sql).not.toMatch(/delete\s+from\s+public\.store_modules/i);
  });

  it("keeps client writes revoked and the mutation RPC service-role only", () => {
    const sql = read("supabase/sql/105_modular_foundation.sql");
    expect(sql).toContain("revoke all on table public.store_modules from anon, authenticated");
    expect(sql).toContain("grant select on table public.store_modules to authenticated");
    expect(sql).toMatch(/revoke all on function public\.set_store_modules_internal[\s\S]+from public, anon, authenticated;/i);
    expect(sql).toMatch(/grant execute on function public\.set_store_modules_internal[\s\S]+to service_role;/i);
  });

  it("preserves RBAC as the source of permission keys used by navigation", () => {
    const nav = read("src/server/access/navigation-access-service.ts");
    const moduleAccess = read("src/server/modules/module-access-service.ts");
    const snapshot = read("src/server/access/permission-snapshot-service.ts");
    expect(nav).toContain("ModuleAccessService.load(context)");
    expect(moduleAccess).toContain("PermissionSnapshotService.load(context)");
    expect(nav).toContain("contextualNavigation(operationalContexts, new Set(permissionKeys), false)");
    expect(snapshot).toContain('from("role_permissions")');
    expect(snapshot).toContain('from("permissions")');
    expect(snapshot).toContain('from("user_store_roles")');
  });

  it("documents route impact and the pre-existing /equipe navigation gap", () => {
    const baseline = read("docs/MODULAR_ARCHITECTURE_BASELINE.md");
    for (const route of ["/dashboard", "/pedidos", "/cardapio", "/pdv", "/caixa", "/salao", "/producao", "/entregas", "/estoque", "/financeiro", "/fiscal", "/m/[slug]"]) {
      expect(baseline).toContain(route);
    }
    expect(baseline).toContain("/equipe");
    expect(baseline).toContain("não possui uma página top-level");
  });
});
