import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseInventoryQuantity } from "@/server/inventory/values";

function read(path: string) { return readFileSync(join(process.cwd(), path), "utf8").toLowerCase(); }
const core = read("supabase/sql/56_inventory_core.sql");
const operations = read("supabase/sql/57_inventory_operations.sql");
const recipes = read("supabase/sql/58_inventory_recipes_consumption.sql");
const hardening = read("supabase/sql/59_inventory_idempotency_hardening.sql");

describe("inventory exact values", () => {
  it("keeps decimal quantities as canonical strings", () => {
    expect(parseInventoryQuantity(" 12,345600 ")).toBe("12.345600");
    expect(parseInventoryQuantity("-2,5", { allowNegative: true })).toBe("-2.5");
    expect(() => parseInventoryQuantity("0.0000001")).toThrow();
    expect(() => parseInventoryQuantity("-1")).toThrow();
  });
});

describe("inventory database contracts", () => {
  it("uses an immutable exact movement ledger and derived balance", () => {
    expect(core).toContain("quantity_delta numeric(18,6)");
    expect(core).toContain("quantity numeric(18,6)");
    expect(core).toContain("inventory_movements_immutable");
    expect(core).toContain("inventory movement ledger is immutable");
    expect(core).not.toContain("double precision");
  });

  it("checks movement idempotency before locking and changing balance", () => {
    const existing = operations.indexOf("select * into v_existing from public.inventory_movements");
    const balance = operations.indexOf("select * into v_balance from public.inventory_balances");
    expect(existing).toBeGreaterThan(-1);
    expect(balance).toBeGreaterThan(existing);
    expect(operations).toContain("inventory idempotency key reused with different payload");
  });

  it("serializes transfers and makes them paired/idempotent", () => {
    expect(hardening).toContain("pg_advisory_xact_lock");
    expect(hardening).toContain("':out'");
    expect(hardening).toContain("':in'");
    expect(hardening).toContain("inventory transfer pair is incomplete");
  });

  it("persists reconciliation idempotency even for zero difference", () => {
    expect(hardening).toContain("'inventory.reconcile'");
    expect(hardening).toContain("public.idempotency_keys");
    expect(hardening).toContain("'difference',0,'created',false");
    expect(hardening).toContain("status='completed'");
  });

  it("keeps inventory and recipes server-only", () => {
    expect(core).toContain("enable row level security");
    expect(core).toContain("revoke all on table public.inventory_items, public.inventory_item_stores, public.inventory_balances, public.inventory_movements, public.recipes, public.recipe_items from anon,authenticated");
    for (const rpc of ["inventory_create_item_internal", "inventory_enable_item_store_internal", "inventory_update_store_item_internal", "inventory_manual_movement_internal", "inventory_transfer_internal", "inventory_reconcile_internal"]) {
      const source = rpc === "inventory_transfer_internal" || rpc === "inventory_reconcile_internal" ? hardening : operations;
      expect(source).toContain(`revoke all on function public.${rpc}`);
      expect(source).toMatch(new RegExp(`grant execute on function public\\.${rpc}[^;]+to service_role`));
    }
  });
});

describe("versioned recipe consumption", () => {
  it("makes recipe versions immutable", () => {
    expect(core).toContain("recipes_immutable");
    expect(core).toContain("recipe_items_immutable");
    expect(core).toContain("recipe versions are immutable");
  });

  it("resolves the recipe by order confirmation time, not today's latest version", () => {
    expect(recipes).toContain("v_effective_at := coalesce(new.confirmed_at,new.created_at)");
    expect(recipes).toContain("r.effective_at<=v_effective_at");
    expect(recipes).toContain("order by r.effective_at desc,r.version desc limit 1");
  });

  it("consumes product and modifier recipes with deterministic keys", () => {
    expect(recipes).toContain("from public.order_items");
    expect(recipes).toContain("from public.order_item_modifiers");
    expect(recipes).toContain("'order:'||new.id::text||':item:'");
    expect(recipes).toContain("'order:'||new.id::text||':modifier:'");
    expect(recipes).toContain("v_modifier.order_item_quantity");
  });

  it("does not fabricate stock consumption for a product without recipe", () => {
    expect(recipes).toContain("inventory.recipe_missing");
    expect(recipes).toContain("v_missing_products := v_missing_products+1");
  });
});
