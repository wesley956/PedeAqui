import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function sql(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8").toLowerCase();
}

describe("database concurrency and idempotency contracts", () => {
  it("serializes checkout conversion on cart and checkout rows", () => {
    const orders = sql("supabase/sql/21_order_access_token.sql");
    expect(orders).toMatch(/from public\.carts[\s\S]*?for update/);
    expect(orders).toMatch(/from public\.checkout_sessions[\s\S]*?for update/);
    expect(orders).toContain("where source_cart_id = v_cart.id");
  });

  it("uses atomic per-store sequence increments and unique order sources", () => {
    const orders = sql("supabase/sql/19_orders.sql") + sql("supabase/sql/21_order_access_token.sql");
    expect(orders).toContain("orders_source_cart_unique");
    expect(orders).toContain("orders_checkout_unique");
    expect(orders).toContain("orders_store_display_unique");
    expect(orders).toContain("last_number = public.order_sequences.last_number + 1");
  });

  it("locks PDV idempotency records before creating the sale", () => {
    const pdv = sql("supabase/sql/30_pdv.sql");
    expect(pdv).toContain("'pdv.sale'");
    expect(pdv).toMatch(/from public\.idempotency_keys[\s\S]*?for update/);
    expect(pdv).toContain("response_body");
  });

  it("claims print jobs with skip-locked leasing", () => {
    const printing = sql("supabase/sql/23_printing.sql") + sql("supabase/sql/26_print_agent_strict_assignment.sql");
    expect(printing).toContain("for update of j skip locked");
    expect(printing).toContain("lease_expires_at");
    expect(printing).toContain("claimed_by_agent_id");
  });

  it("keeps print intent and reprints idempotently addressable", () => {
    const printing = sql("supabase/sql/23_printing.sql");
    expect(printing).toContain("idempotency_key");
    expect(printing).toContain("unique");
    expect(printing).toContain("original_job_id");
    expect(printing).toContain("is_reprint");
  });
});
