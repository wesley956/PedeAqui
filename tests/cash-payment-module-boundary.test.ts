import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/sql/129_cash_payment_module_boundary.sql", "utf8");

describe("cash payment module boundary", () => {
  it("does not require the optional cash module to settle a cash payment", () => {
    expect(migration).toContain("from public.store_modules sm");
    expect(migration).toContain("sm.module_key = 'cash'");
    expect(migration).toContain("if not v_cash_enabled then return new; end if;");
  });

  it("keeps strict cash-session accounting when the cash module participates", () => {
    expect(migration).toContain("private.cash_open_session_for_actor(new.store_id, v_actor)");
    expect(migration).toContain("private.cash_insert_movement(");
    expect(migration).toContain("'sale', 'in'");
  });

  it("does not fabricate a cash refund movement for a payment never recorded in cash", () => {
    expect(migration).toContain("where payment_id = new.id");
    expect(migration).toContain("movement_type = 'sale'");
    expect(migration).toContain("if v_original.id is null then return new; end if;");
    expect(migration).toContain("'refund', 'out'");
  });
});
