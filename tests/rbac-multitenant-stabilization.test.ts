import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MODULE_CATALOG, MODULE_KEYS, type ModuleKey } from "@/modules/module-catalog";
import { resolveModuleAvailability } from "@/modules/module-access";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

type BusinessType = (typeof MODULE_CATALOG)[ModuleKey]["supportedBusinessTypes"][number];

const SYSTEM_ROLES = ["owner", "manager", "cashier", "attendant", "waiter", "kitchen", "driver", "financial"] as const;

function supportedBusinessType(moduleKey: ModuleKey): BusinessType {
  const businessType = MODULE_CATALOG[moduleKey].supportedBusinessTypes[0];
  if (!businessType) throw new Error(`Module ${moduleKey} has no supported business type fixture`);
  return businessType;
}

function enabledWithDependencies(moduleKey: ModuleKey) {
  const active = new Set<ModuleKey>([moduleKey]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const key of [...active]) {
      for (const dependency of MODULE_CATALOG[key].dependencies) {
        if (!active.has(dependency)) {
          active.add(dependency);
          changed = true;
        }
      }
    }
  }
  return active;
}

describe("stabilization #821 RBAC, multi-tenant and multi-unit matrix", () => {
  it("documents the real role matrix and keeps platform super admin separate", () => {
    const matrix = read("docs/stabilization/RBAC_MATRIX_821.md");
    for (const role of SYSTEM_ROLES) expect(matrix).toContain(`\`${role}\``);
    expect(matrix).toContain("Super admin controlado");
    expect(matrix).toContain("autorização de plataforma é separada");
    expect(matrix).toContain("Modo Fácil");
  });

  it("keeps every system organization role present in the canonical onboarding bootstrap", () => {
    const bootstrap = read("supabase/sql/90_onboarding_role_permission_conflict_hotfix.sql");
    for (const role of SYSTEM_ROLES) {
      expect(bootstrap, `system role ${role} must be bootstrapped`).toContain(`'${role}'`);
    }
    expect(bootstrap).toContain("select owner_role_id, id from public.permissions");
    expect(bootstrap).toContain("where key <> 'organization.manage'");
  });

  it("preserves least-privilege baselines for operational roles", () => {
    const bootstrap = read("supabase/sql/90_onboarding_role_permission_conflict_hotfix.sql");
    expect(bootstrap).toMatch(/select cashier_role_id,[\s\S]*?'cash\.open'[\s\S]*?'cash\.close'/);
    expect(bootstrap).toMatch(/select attendant_role_id,[\s\S]*?'products\.view'[\s\S]*?'customers\.manage'/);
    expect(bootstrap).toMatch(/select waiter_role_id,[\s\S]*?'orders\.view'[\s\S]*?'orders\.edit'/);
    expect(bootstrap).toMatch(/select kitchen_role_id,[\s\S]*?'orders\.view'[\s\S]*?'orders\.edit'/);
    expect(bootstrap).toMatch(/select driver_role_id,[\s\S]*?where key = 'orders\.view'/);
    expect(bootstrap).toMatch(/select financial_role_id,[\s\S]*?'dashboard\.view'[\s\S]*?'reports\.view'/);
  });

  it("never trusts organization or store cookies without revalidating ownership", () => {
    const context = read("src/server/access/context.ts");
    expect(context).toContain("requireAuthenticatedUser()");
    expect(context).toContain('.from("organization_members")');
    expect(context).toContain('.eq("user_id", user.id)');
    expect(context).toContain('.eq("status", "active")');
    expect(context).toContain('membershipQuery = membershipQuery.eq("organization_id", requestedOrganizationId)');
    expect(context).toContain('.from("stores")');
    expect(context).toContain('.eq("organization_id", membership.organization_id)');
    expect(context).toContain('storeQuery = storeQuery.eq("id", requestedStoreId)');
  });

  it("binds permission checks to auth.uid, organization and the exact store role", () => {
    const rls = read("supabase/sql/02_rls_policies.sql");
    expect(rls).toContain("m.user_id = (select auth.uid())");
    expect(rls).toContain("m.organization_id = target_organization_id");
    expect(rls).toContain("usr.organization_id = target_organization_id");
    expect(rls).toContain("usr.store_id = target_store_id");
    expect(rls).toContain("usr.user_id = (select auth.uid())");
    expect(rls).toContain("r.organization_id = usr.organization_id");
  });

  it("keeps the public permission wrapper invoker-only and authenticated-only", () => {
    const wrapper = read("supabase/sql/05_access_rpc.sql");
    expect(wrapper).toContain("security invoker");
    expect(wrapper).toContain("set search_path = ''");
    expect(wrapper).toContain("select private.has_permission(organization_id, store_id, permission_key)");
    expect(wrapper).toContain("revoke all on function public.has_permission(uuid, uuid, text) from public");
    expect(wrapper).toContain("grant execute on function public.has_permission(uuid, uuid, text) to authenticated");
  });

  it("checks every server authorization against organization/store context through has_permission", () => {
    const authorize = read("src/server/access/authorize.ts");
    expect(authorize).toContain('supabase.rpc("has_permission"');
    expect(authorize).toContain("organization_id: organizationId");
    expect(authorize).toContain("store_id: storeId");
    expect(authorize).toContain("permission_key: permission");
    expect(authorize).toContain("if (data !== true) throw new AuthorizationError(permission)");
    expect(authorize).toContain("checkPermission(context.organizationId, null, permission)");
  });

  it.each(MODULE_KEYS)("denies %s when the store has the module disabled", (moduleKey) => {
    const definition = MODULE_CATALOG[moduleKey];
    const result = resolveModuleAvailability({
      definition,
      businessType: supportedBusinessType(moduleKey),
      storeEnabled: false,
      activeModuleKeys: enabledWithDependencies(moduleKey),
      grantedPermissions: new Set(definition.permissionsAny),
      entitlementAllowed: true,
    });
    expect(result).toMatchObject({ available: false, reason: "disabled_by_store" });
  });

  it.each(MODULE_KEYS)("denies %s when its commercial entitlement is unavailable", (moduleKey) => {
    const definition = MODULE_CATALOG[moduleKey];
    const result = resolveModuleAvailability({
      definition,
      businessType: supportedBusinessType(moduleKey),
      storeEnabled: true,
      activeModuleKeys: enabledWithDependencies(moduleKey),
      grantedPermissions: new Set(definition.permissionsAny),
      entitlementAllowed: false,
    });
    expect(result).toMatchObject({ available: false, reason: "not_in_plan" });
  });

  it.each(MODULE_KEYS.filter((key) => MODULE_CATALOG[key].permissionsAny.length > 0))(
    "denies %s when the role lacks every required permission",
    (moduleKey) => {
      const definition = MODULE_CATALOG[moduleKey];
      const result = resolveModuleAvailability({
        definition,
        businessType: supportedBusinessType(moduleKey),
        storeEnabled: true,
        activeModuleKeys: enabledWithDependencies(moduleKey),
        grantedPermissions: new Set(),
        entitlementAllowed: true,
      });
      expect(result).toMatchObject({ available: false, reason: "permission_denied" });
    },
  );

  it.each(MODULE_KEYS.filter((key) => MODULE_CATALOG[key].dependencies.length > 0))(
    "denies %s when a dependency is stale/missing in the active unit",
    (moduleKey) => {
      const definition = MODULE_CATALOG[moduleKey];
      const result = resolveModuleAvailability({
        definition,
        businessType: supportedBusinessType(moduleKey),
        storeEnabled: true,
        activeModuleKeys: new Set<ModuleKey>([moduleKey]),
        grantedPermissions: new Set(definition.permissionsAny),
        entitlementAllowed: true,
      });
      expect(result.available).toBe(false);
      expect(result.reason).toBe("missing_dependency");
      expect(result.missingDependencies.length).toBeGreaterThan(0);
    },
  );

  it.each(MODULE_KEYS)("allows %s only when unit, plan, dependencies and permission agree", (moduleKey) => {
    const definition = MODULE_CATALOG[moduleKey];
    const result = resolveModuleAvailability({
      definition,
      businessType: supportedBusinessType(moduleKey),
      storeEnabled: true,
      activeModuleKeys: enabledWithDependencies(moduleKey),
      grantedPermissions: new Set(definition.permissionsAny),
      entitlementAllowed: true,
    });
    expect(result).toMatchObject({ available: true, reason: "available" });
  });
});
