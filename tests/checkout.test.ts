import { describe, expect, it } from "vitest";
import { reviewCheckout } from "@/server/checkout/review";
import { checkoutPaymentSchema } from "@/server/checkout/schemas";

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
});

describe("checkout payment schema", () => {
  it("rejects change for non-cash payments", () => {
    expect(() => checkoutPaymentSchema.parse({ method: "pix", cashChangeForCents: 10000 })).toThrow();
  });
});
