import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/sql/38_growth_core.sql"), "utf8").toLowerCase();

describe("growth database contracts", () => {
  it("defines explicit growth permissions", () => {
    expect(sql).toContain("'growth.view'");
    expect(sql).toContain("'growth.manage'");
    expect(sql).toContain("'growth.campaigns'");
  });

  it("creates coupon and rewards ledgers", () => {
    for (const table of [
      "store_growth_settings",
      "coupons",
      "cashback_accounts",
      "cashback_transactions",
      "loyalty_accounts",
      "loyalty_transactions",
    ]) {
      expect(sql).toContain(`public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
    }
  });

  it("keeps reward balances non-negative and ledgers signed", () => {
    expect(sql).toContain("balance_cents >= 0");
    expect(sql).toContain("balance_points >= 0");
    expect(sql).toContain("cashback_transactions_sign_check");
    expect(sql).toContain("loyalty_transactions_sign_check");
  });

  it("uses idempotency keys for both reward ledgers", () => {
    expect(sql).toContain("cashback_transactions_org_idem_unique");
    expect(sql).toContain("loyalty_transactions_org_idem_unique");
    expect(sql.match(/idempotency_key text not null/g)?.length).toBe(2);
  });

  it("does not grant browser roles mutation privileges", () => {
    expect(sql).toContain("revoke all on table");
    expect(sql).toContain("from anon, authenticated");
    expect(sql).toContain("to authenticated");
    expect(sql).not.toMatch(/grant\s+(insert|update|delete)[^;]*to\s+authenticated/);
  });
});
