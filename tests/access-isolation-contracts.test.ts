import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NAVIGATION_MODULES, canSurfaceModule } from "@/components/layout/navigation-model";
import { PERMISSIONS } from "@/server/access/permissions";

const root = process.cwd();
const permissionValues = new Set(Object.values(PERMISSIONS));
function read(relativePath: string) { return fs.readFileSync(path.join(root, relativePath), "utf8"); }

describe("access isolation contracts", () => {
  it("never surfaces an organization module without a real granted permission", () => {
    for (const navModule of NAVIGATION_MODULES.filter((item) => item.authorization === "organization")) {
      expect(navModule.permissions.length, `${navModule.key} must declare permissions`).toBeGreaterThan(0);
      for (const permission of navModule.permissions) expect(permissionValues.has(permission)).toBe(true);
      expect(canSurfaceModule(navModule, new Set())).toBe(false);
      const firstPermission = navModule.permissions[0];
      if (!firstPermission) throw new Error(`${navModule.key} must declare at least one permission`);
      expect(canSurfaceModule(navModule, new Set([firstPermission]))).toBe(true);
    }
  });

  it("keeps platform authorization separate from organization permissions", () => {
    const platform = NAVIGATION_MODULES.find((item) => item.authorization === "platform");
    expect(platform).toBeDefined();
    if (!platform) return;
    expect(canSurfaceModule(platform, new Set(Object.values(PERMISSIONS)), false)).toBe(false);
    expect(canSurfaceModule(platform, new Set(), true)).toBe(true);
  });

  it("keeps server authorization bound to organization/store context and has_permission", () => {
    const source = read("src/server/access/authorize.ts");
    expect(source).toContain('supabase.rpc("has_permission"');
    expect(source).toContain("organization_id: context.organizationId");
    expect(source).toContain("store_id: storeId");
    expect(source).toContain("checkPermission(context, permission, context.storeId)");
    expect(source).toContain("checkPermission(context, permission, null)");
    expect(source).not.toMatch(/user_metadata/i);
    expect(source).not.toContain("NAVIGATION_MODULES");
  });

  it("keeps server-only inventory, purchasing and finance tables revoked from client roles", () => {
    const inventory = read("supabase/sql/56_inventory_core.sql");
    const purchases = read("supabase/sql/62_purchases_core.sql");
    const finance = read("supabase/sql/66_finance_core.sql");
    for (const source of [inventory, purchases, finance]) {
      expect(source).toMatch(/revoke all on table[\s\S]+from anon,authenticated;/i);
      expect(source).toMatch(/grant select,insert,update,delete on table[\s\S]+to service_role;/i);
    }
  });

  it("keeps every application permission represented in versioned SQL", () => {
    const sqlDir = path.join(root, "supabase/sql");
    const sql = fs.readdirSync(sqlDir).filter((name) => name.endsWith(".sql"))
      .map((name) => fs.readFileSync(path.join(sqlDir, name), "utf8")).join("\n");
    for (const permission of permissionValues) expect(sql, `${permission} must be seeded/versioned`).toContain(`'${permission}'`);
  });
});
