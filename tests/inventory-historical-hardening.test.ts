import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/sql/61_inventory_historical_recipe_hardening.sql"), "utf8").toLowerCase();

describe("inventory historical recipe hardening", () => {
  it("requires a recipe to be both effective and already created at confirmation", () => {
    expect(sql).toContain("r.effective_at<=v_effective_at");
    expect(sql).toContain("r.created_at<=v_effective_at");
    expect(sql).toContain("order by r.effective_at desc,r.version desc limit 1");
  });

  it("keeps historical order consumption possible after an ingredient is deactivated", () => {
    const privateMovement = sql.slice(sql.indexOf("create or replace function private.inventory_insert_movement"), sql.indexOf("create or replace function public.inventory_manual_movement_internal"));
    const manualMovement = sql.slice(sql.indexOf("create or replace function public.inventory_manual_movement_internal"), sql.indexOf("create or replace function private.consume_order_inventory"));
    expect(privateMovement).toContain("inventory item is not configured in store");
    expect(privateMovement).not.toContain("and active=true");
    expect(manualMovement).toContain("and active=true");
    expect(manualMovement).toContain("inventory item is not active in store");
  });

  it("records missing modifier recipes instead of inventing consumption", () => {
    expect(sql).toContain("v_missing_modifiers:=v_missing_modifiers+1");
    expect(sql).toContain("'target_type','modifier'");
    expect(sql).toContain("'missing_modifier_recipes',v_missing_modifiers");
  });
});
