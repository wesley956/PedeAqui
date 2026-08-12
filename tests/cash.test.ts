import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { calculateCashDifference, calculateExpectedCash } from "@/features/cash/model";

function sql(name: string) {
  return readFileSync(join(process.cwd(), `supabase/sql/${name}`), "utf8").toLowerCase();
}

const core = sql("47_cash_core.sql");
const operations = sql("48_cash_operations.sql");
const payments = sql("49_cash_payment_integration.sql");
const idempotency = sql("50_cash_idempotency_hardening.sql");

describe("cash reconciliation", () => {
  it("projects physical cash from immutable movements", () => {
    expect(calculateExpectedCash([
      { movementType: "opening", direction: "in", amountCents: 10_000 },
      { movementType: "supply", direction: "in", amountCents: 2_000 },
      { movementType: "sale", direction: "in", amountCents: 1_590 },
      { movementType: "withdrawal", direction: "out", amountCents: 1_000 },
      { movementType: "refund", direction: "out", amountCents: 1_590 },
    ])).toBe(11_000);
  });

  it("rejects a projection that goes physically negative", () => {
    expect(() => calculateExpectedCash([
      { movementType: "opening", direction: "in", amountCents: 500 },
      { movementType: "withdrawal", direction: "out", amountCents: 600 },
    ])).toThrow("Invalid expected cash balance");
  });

  it("calculates shortages and overages", () => {
    expect(calculateCashDifference(10_900, 11_000)).toBe(-100);
    expect(calculateCashDifference(11_100, 11_000)).toBe(100);
  });
});

describe("cash database contracts", () => {
  it("creates register, session and immutable movement ledger with RLS", () => {
    for (const table of ["cash_registers", "cash_sessions", "cash_movements"]) {
      expect(core).toContain(`public.${table}`);
      expect(core).toContain(`alter table public.${table} enable row level security`);
    }
    expect(core).toContain("cash_movements_immutable");
    expect(core).toContain("cash movement ledger is immutable");
  });

  it("prevents duplicate simultaneous sessions", () => {
    expect(core).toContain("cash_sessions_one_open_per_register_idx");
    expect(core).toContain("cash_sessions_one_open_per_operator_store_idx");
    expect(core).toContain("where status = 'open'");
  });

  it("keeps mutations server-only while authenticated reads still use permission RLS", () => {
    expect(core).toContain("revoke all on table public.cash_registers, public.cash_sessions, public.cash_movements from anon, authenticated");
    expect(core).toContain("grant select on table public.cash_registers, public.cash_sessions, public.cash_movements to authenticated");
    expect(core).toContain("private.has_permission(organization_id, store_id, 'cash.view')");
    for (const rpc of ["cash_create_register_internal", "cash_open_session_internal", "cash_manual_movement_internal", "cash_close_session_internal"]) {
      expect(operations).toContain(`revoke all on function public.${rpc}`);
      expect(operations).toMatch(new RegExp(`grant execute on function public\\.${rpc}[^;]+to service_role`));
    }
  });

  it("derives expected cash and never trusts a browser-supplied balance", () => {
    expect(core).toContain("private.cash_expected_balance");
    expect(operations).toContain("v_expected := private.cash_expected_balance");
    expect(operations).toContain("difference_cents=p_counted_cash_cents-v_expected");
  });

  it("projects paid cash and refunds from the payment ledger", () => {
    expect(payments).toContain("payments_sync_cash_movement");
    expect(payments).toContain("'sale','in'");
    expect(payments).toContain("'refund','out'");
    expect(payments).toContain("reference_movement_id");
    expect(payments).toContain("open cash session required for cash payment");
  });

  it("makes manual outflow retries idempotent before rechecking reduced balance", () => {
    const existingIndex = idempotency.indexOf("select * into v_existing");
    const balanceIndex = idempotency.indexOf("cash withdrawal exceeds expected balance");
    expect(existingIndex).toBeGreaterThan(-1);
    expect(balanceIndex).toBeGreaterThan(existingIndex);
    expect(idempotency).toContain("cash movement idempotency key reused with different payload");
  });

  it("refunds by compensating movement instead of deleting the original cash sale", () => {
    expect(payments).toContain("payment_refund_internal");
    expect(payments).toContain("cash sale movement missing for refund");
    expect(core).toContain("reference_movement_id");
    expect(core).not.toContain("delete from public.cash_movements");
  });
});
