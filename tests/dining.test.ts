import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canManuallyTransitionTable, occupiedMinutes, tabBalance } from "@/server/dining/model";

const sql = [
  "supabase/sql/33_dining_core.sql",
  "supabase/sql/34_dining_operations.sql",
  "supabase/sql/35_dining_rounds_settlement_public.sql",
].map((path) => readFileSync(join(process.cwd(), path), "utf8")).join("\n").toLowerCase();

describe("dining domain", () => {
  it("keeps occupied state controlled by an active tab", () => {
    expect(canManuallyTransitionTable("occupied", "available")).toBe(false);
    expect(canManuallyTransitionTable("cleaning", "available")).toBe(true);
  });
  it("computes safe account balances", () => {
    expect(tabBalance(10_000, 2_500)).toBe(7_500);
    expect(() => tabBalance(1_000, 1_001)).toThrow();
  });
  it("computes occupancy time defensively", () => {
    expect(occupiedMinutes("2026-08-11T00:00:00.000Z", Date.parse("2026-08-11T00:42:30.000Z"))).toBe(42);
    expect(occupiedMinutes(null)).toBe(0);
  });
});

describe("dining database contracts", () => {
  it("allows only one active tab per table and locks lifecycle operations", () => {
    expect(sql).toContain("tabs_one_active_per_table_idx");
    expect(sql).toContain("where status in ('open','settling')");
    expect(sql).toMatch(/from\s+public\.tables\s+where\s+id\s*=\s*p_table_id\s+for\s+update/);
    expect(sql).toMatch(/from\s+public\.tabs\s+where\s+id\s*=\s*p_tab_id\s+for\s+update/);
  });
  it("reuses orders, production and printing for waiter/table QR rounds", () => {
    expect(sql).toContain("channel in ('waiter','table_qr')");
    expect(sql).toContain("fulfillment_type = 'table'");
    expect(sql).toMatch(/public\.order_transition_internal\(v_order_id\s*,\s*'order'\s*,\s*'confirmed'/);
    expect(sql).toMatch(/public\.order_start_production_internal\(v_order_id/);
  });
  it("keeps round and payment operations idempotent", () => {
    expect(sql).toContain("'dining.round'");
    expect(sql).toContain("'dining.payment'");
    expect(sql).toContain("for update");
  });
  it("checks enabled payment methods and supports person-scoped split", () => {
    expect(sql).toContain("payment method disabled");
    expect(sql).toContain("payment exceeds tab member balance");
    expect(sql).toContain("metadata->>'tab_member_id'");
  });
  it("does not expose internal UUIDs in the anonymous table projection", () => {
    const start = sql.indexOf("create or replace function private.get_public_table");
    const publicProjection = sql.slice(start);
    expect(publicProjection).not.toContain("'id', s.id");
    expect(publicProjection).not.toContain("'id', t.id");
    expect(publicProjection).not.toContain("'id', tb.id");
    expect(publicProjection).toContain("'display_number'");
  });
});
