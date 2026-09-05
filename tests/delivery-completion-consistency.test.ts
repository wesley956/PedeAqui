import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs.readFileSync(
  path.join(process.cwd(), "supabase/sql/189_delivery_completion_consistency.sql"),
  "utf8",
).toLowerCase();

describe("delivery completion consistency", () => {
  it("synchronizes only authoritative delivery completions", () => {
    expect(sql).toContain("new.fulfillment_type = 'delivery'");
    expect(sql).toContain("new.fulfillment_status = 'delivered'");
    expect(sql).toContain("old.fulfillment_status is distinct from 'delivered'");
    expect(sql).toContain("after update of fulfillment_status on public.orders");
  });

  it("does not reopen, cancel, or overwrite completed logistics timestamps", () => {
    expect(sql).toContain("delivered_at = coalesce(delivered_at");
    expect(sql).toContain("and delivered_at is null");
    expect(sql).toContain("and canceled_at is null");
    expect(sql).not.toMatch(/delete\s+from/);
  });

  it("backfills only projections already proven delivered by their order", () => {
    expect(sql).toContain("from public.orders o");
    expect(sql).toContain("o.id = d.order_id");
    expect(sql).toContain("o.organization_id = d.organization_id");
    expect(sql).toContain("o.store_id = d.store_id");
    expect(sql).toContain("o.fulfillment_status = 'delivered'");
  });

  it("keeps the trigger function private and invoker-scoped", () => {
    expect(sql).toContain("create or replace function private.sync_delivery_completion_from_order");
    expect(sql).toContain("security invoker");
    expect(sql).toContain("set search_path = ''");
  });
});
