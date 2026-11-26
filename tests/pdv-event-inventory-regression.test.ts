import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
describe("event stock preserves existing historical recipe consumption", () => {
  it("adds only an early event return to the latest canonical consumption function", () => {
    const baseline=readFileSync("supabase/sql/61_inventory_historical_recipe_hardening.sql","utf8");
    const migration=readFileSync("supabase/migrations/20261126140000_pdv_events.sql","utf8");
    const marker="create or replace function private.consume_order_inventory()";
    const expected=baseline.slice(baseline.indexOf(marker)).trim();
    const changed=migration.slice(migration.indexOf(marker),migration.indexOf("-- Aggregate on the server:")).trim();
    const preserved=changed.replace("  -- Finished event products were already allocated; preserve the historical recipe logic for regular orders.\n  if private.pdv_event_order_exists(new.organization_id,new.store_id,new.id) then return new; end if;\n","");
    expect(preserved).toBe(expected);
    expect(migration).toContain("private.can_access_store(p_organization_id,p_store_id)");
  });
});
