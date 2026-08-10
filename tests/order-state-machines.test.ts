import { describe, expect, it } from "vitest";
import {
  assertTransition,
  canTransition,
  fulfillmentIsComplete,
  initialOrderStates,
} from "@/server/orders/state-machines";

describe("order state machines", () => {
  it("starts each lifecycle independently", () => {
    expect(initialOrderStates).toEqual({
      order: "pending_confirmation",
      payment: "pending",
      production: "pending_confirmation",
      fulfillment: "pending",
    });
  });

  it("allows confirming an order without pretending payment is paid", () => {
    expect(canTransition("order", "pending_confirmation", "confirmed")).toBe(true);
    expect(initialOrderStates.payment).toBe("pending");
  });

  it("does not allow production to skip queued/preparing", () => {
    expect(canTransition("production", "pending_confirmation", "ready")).toBe(false);
    expect(() => assertTransition("production", "pending_confirmation", "ready")).toThrow();
  });

  it("allows retrying a failed payment", () => {
    expect(canTransition("payment", "failed", "pending")).toBe(true);
  });

  it("allows an in-flight delivery to be canceled operationally", () => {
    expect(canTransition("fulfillment", "out_for_delivery", "canceled")).toBe(true);
  });

  it("knows which fulfillment states are terminally complete", () => {
    expect(fulfillmentIsComplete("delivered")).toBe(true);
    expect(fulfillmentIsComplete("picked_up_by_customer")).toBe(true);
    expect(fulfillmentIsComplete("awaiting_pickup")).toBe(false);
  });

  it("keeps canceled and completed order states terminal", () => {
    expect(canTransition("order", "canceled", "confirmed")).toBe(false);
    expect(canTransition("order", "completed", "canceled")).toBe(false);
  });
});
