import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MODULE_CATALOG, MODULE_KEYS, type ModuleKey } from "@/modules/module-catalog";
import { resolveModuleAvailability } from "@/modules/module-access";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

type BusinessType = (typeof MODULE_CATALOG)[ModuleKey]["supportedBusinessTypes"][number];

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

  it("checks every authorization against organization/store context through has_permission", () => {
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
