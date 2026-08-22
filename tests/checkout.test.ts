import { describe, expect, it } from "vitest";
import { reviewCheckout } from "@/server/checkout/review";
import { checkoutPaymentSchema, checkoutScheduleSchema } from "@/server/checkout/schemas";
import { assertScheduledWindow, localDateTimeInputValue, zonedLocalDateTimeToUtc } from "@/server/checkout/scheduling";

const base = {
  cartItemStatuses: ["valid"] as const,
  subtotalCents: 5000,
  totalCents: 5800,
  minimumOrderCents: 2000,
  canOrder: true,
  identityComplete: true,
  fulfillmentType: "delivery" as const,
  deliveryQuoteStatus: "valid" as const,
  paymentMethod: "pix" as const,
  enabledPaymentMethods: ["pix", "cash"] as const,
  cashChangeForCents: null,
  scheduledFor: null,
};

describe("checkout review", () => {
  it("accepts a complete valid checkout", () => {
    expect(reviewCheckout({ ...base, enabledPaymentMethods: [...base.enabledPaymentMethods] }).ready).toBe(true);
  });

  it("blocks invalid cart items", () => {
    const result = reviewCheckout({ ...base, cartItemStatuses: ["unavailable"], enabledPaymentMethods: [...base.enabledPaymentMethods] });
    expect(result.blockers.some((item) => item.code === "empty_or_invalid_cart")).toBe(true);
  });

  it("blocks delivery without a valid quote", () => {
    const result = reviewCheckout({ ...base, deliveryQuoteStatus: "unserviceable", enabledPaymentMethods: [...base.enabledPaymentMethods] });
    expect(result.blockers.some((item) => item.code === "delivery_not_ready")).toBe(true);
  });

  it("blocks a payment method disabled after selection", () => {
    const result = reviewCheckout({ ...base, enabledPaymentMethods: ["cash"] });
    expect(result.blockers.some((item) => item.code === "payment_unavailable")).toBe(true);
  });

  it("blocks checkout while store is paused or closed", () => {
    const result = reviewCheckout({ ...base, canOrder: false, enabledPaymentMethods: [...base.enabledPaymentMethods] });
    expect(result.blockers.some((item) => item.code === "store_unavailable")).toBe(true);
  });

  it("requires cash change amount to cover the total", () => {
    const result = reviewCheckout({
      ...base,
      paymentMethod: "cash",
      enabledPaymentMethods: ["cash"],
      cashChangeForCents: 5000,
    });
    expect(result.blockers.some((item) => item.code === "invalid_change")).toBe(true);
  });

  it("blocks a scheduled time that became too close while checkout was open", () => {
    const now = new Date("2026-08-22T14:00:00.000Z");
    const result = reviewCheckout({ ...base, enabledPaymentMethods: [...base.enabledPaymentMethods], scheduledFor: "2026-08-22T14:09:59.000Z", now });
    expect(result.blockers.some((item) => item.code === "schedule_invalid")).toBe(true);
  });
});

describe("checkout payment schema", () => {
  it("rejects change for non-cash payments", () => {
    expect(() => checkoutPaymentSchema.parse({ method: "pix", cashChangeForCents: 10000 })).toThrow();
  });
});

describe("checkout scheduling", () => {
  it("validates asap and store-local scheduled inputs", () => {
    expect(checkoutScheduleSchema.parse({ mode: "asap" })).toEqual({ mode: "asap" });
    expect(checkoutScheduleSchema.parse({ mode: "scheduled", localDateTime: "2026-08-22T12:30" }).mode).toBe("scheduled");
  });

  it("converts the store-local time without relying on the server timezone", () => {
    const instant = zonedLocalDateTimeToUtc("2026-08-22T12:30", "America/Sao_Paulo");
    expect(instant.toISOString()).toBe("2026-08-22T15:30:00.000Z");
    expect(localDateTimeInputValue(instant, "America/Sao_Paulo")).toBe("2026-08-22T12:30");
  });

  it("enforces the 15 minute to 7 day scheduling window", () => {
    const now = new Date("2026-08-22T14:00:00.000Z");
    expect(assertScheduledWindow(new Date("2026-08-22T14:15:00.000Z"), now)).toBeInstanceOf(Date);
    expect(() => assertScheduledWindow(new Date("2026-08-22T14:14:59.000Z"), now)).toThrow();
    expect(() => assertScheduledWindow(new Date("2026-08-29T14:00:01.000Z"), now)).toThrow();
  });
});
