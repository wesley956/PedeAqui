import { describe, expect, it } from "vitest";
import { reviewCheckout } from "@/server/checkout/review";
import { assertTransition, canTransition } from "@/server/orders/state-machines";

// CPU-heavy, deterministic domain simulation: does NOT write orders, contact payment
// providers or measure real DB/network throughput. Do not mistake this for end-to-end load.
const ITERATIONS = 50_000;
const now = new Date("2026-10-14T12:00:00.000Z");
const base = {
  cartItemStatuses: ["valid"] as const,
  subtotalCents: 5000,
  totalCents: 5800,
  minimumOrderCents: 1000,
  canOrder: true,
  identityComplete: true,
  fulfillmentType: "delivery" as const,
  deliveryQuoteStatus: "valid" as const,
  paymentMethod: "pix" as const,
  enabledPaymentMethods: ["pix", "cash"] as const,
  cashChangeForCents: null,
  scheduledFor: null,
  now,
};

describe("VPS synthetic domain stress (no DB / no side effects)", () => {
  it("validates 50k successful delivery/pickup checkout reviews", () => {
    for (let n = 0; n < ITERATIONS; n++) {
      const input = n % 2
        ? { ...base, fulfillmentType: "pickup" as const, deliveryQuoteStatus: "not_required" as const }
        : base;
      const result = reviewCheckout(input);
      if (!result.ready || result.blockers.length > 0) throw new Error("valid checkout unexpectedly blocked: " + n);
    }
    expect(true).toBe(true);
  });
  it("rejects 50k unsafe cash changes, unavailable stores and invalid delivery quotes", () => {
    for (let n = 0; n < ITERATIONS; n++) {
      const input = n % 3 === 0
        ? { ...base, paymentMethod: "cash" as const, cashChangeForCents: 5000 }
        : n % 3 === 1
          ? { ...base, canOrder: false }
          : { ...base, deliveryQuoteStatus: "unserviceable" as const };
      const result = reviewCheckout(input);
      const expected = n % 3 === 0 ? "invalid_change" : n % 3 === 1 ? "store_unavailable" : "delivery_not_ready";
      if (result.ready || !result.blockers.some(b => b.code === expected))
        throw new Error("unsafe checkout allowed: " + n + " / " + expected);
    }
    expect(true).toBe(true);
  });
  it("checks 50k valid and forbidden order transitions", () => {
    for (let n = 0; n < ITERATIONS; n++) {
      assertTransition("order", "pending_confirmation", "confirmed");
      assertTransition("production", "queued", "preparing");
      if (canTransition("order", "completed", "confirmed"))
        throw new Error("terminal order state reopened: " + n);
      if (canTransition("payment", "refunded", "paid"))
        throw new Error("refunded payment improperly reopened: " + n);
    }
    expect(true).toBe(true);
  });
});
