import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const service = readFileSync(join(process.cwd(), "src/server/inventory/inventory-service.ts"), "utf8").toLowerCase();

describe("inventory store status contract", () => {
  it("filters stores by the stores.status column used by the current schema", () => {
    expect(service).toContain('admin.from("stores").select("id,name").eq("organization_id", context.organizationid).eq("status", "active").order("name")');
    expect(service).toContain('admin.from("stores").select("id").eq("id", targetstoreid).eq("organization_id", context.organizationid).eq("status", "active").maybesingle()');
    expect(service).not.toContain('admin.from("stores").select("id,name").eq("organization_id", context.organizationid).eq("active", true)');
    expect(service).not.toContain('admin.from("stores").select("id").eq("id", targetstoreid).eq("organization_id", context.organizationid).eq("active", true)');
  });
});
