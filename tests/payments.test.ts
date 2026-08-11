import { describe, expect, it } from "vitest";
import { canReservePayment, resolveCashTendered, summarizePayments } from "@/server/payments/payment-model";

describe("payment ledger summary", () => {
  it("keeps order pending while split payment is only partially paid", () => {
    const summary = summarizePayments([
      { amountCents: 3000, status: "paid" },
      { amountCents: 2000, status: "pending" },
    ], 5000);
    expect(summary.paidCents).toBe(3000);
    expect(summary.reservedCents).toBe(5000);
    expect(summary.remainingCents).toBe(2000);
    expect(summary.settled).toBe(false);
  });

  it("marks the ledger settled only when paid amount equals the order total", () => {
    const summary = summarizePayments([
      { amountCents: 2500, status: "paid" },
      { amountCents: 2500, status: "paid" },
    ], 5000);
    expect(summary.remainingCents).toBe(0);
    expect(summary.settled).toBe(true);
  });

  it("does not reserve failed attempts", () => {
    const summary = summarizePayments([
      { amountCents: 5000, status: "failed" },
    ], 5000);
    expect(summary.reservedCents).toBe(0);
    expect(summary.availableToReserveCents).toBe(5000);
  });
});

describe("cash payment", () => {
  it("computes change in integer cents", () => {
    expect(resolveCashTendered(3790, 5000, null)).toEqual({ tenderedCents: 5000, changeDueCents: 1210 });
  });

  it("rejects received amount below the payment", () => {
    expect(() => resolveCashTendered(3790, null, 3000)).toThrow(/cover payment amount/i);
  });
});

describe("split payment capacity", () => {
  it("prevents active intents from exceeding the order total", () => {
    expect(canReservePayment(10000, 6000, 4000)).toBe(true);
    expect(canReservePayment(10000, 6000, 4001)).toBe(false);
  });
});
