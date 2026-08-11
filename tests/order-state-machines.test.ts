import { describe, expect, it } from "vitest";
import {
  assertTransition,
  canTransition,
  fulfillmentIsComplete,
  initialOrderStates,
  type FulfillmentStatus,
  type OrderStateDomain,
  type OrderStatus,
  type PaymentStatus,
  type ProductionStatus,
} from "@/server/orders/state-machines";

const matrix = {
  order: {
    pending_confirmation: ["confirmed", "rejected", "canceled"],
    confirmed: ["completed", "canceled"],
    rejected: [], canceled: [], completed: [],
  },
  payment: {
    pending: ["authorized", "paid", "failed"],
    authorized: ["paid", "failed"],
    paid: ["partially_refunded", "refunded"],
    failed: ["pending"],
    partially_refunded: ["refunded"],
    refunded: [],
  },
  production: {
    pending_confirmation: ["queued", "canceled", "not_required"],
    queued: ["preparing", "canceled"],
    preparing: ["ready", "canceled"],
    ready: ["canceled"],
    canceled: [], not_required: [],
  },
  fulfillment: {
    pending: ["awaiting_assignment", "awaiting_pickup", "served", "canceled", "not_required"],
    awaiting_assignment: ["assigned", "canceled"],
    assigned: ["picked_up", "canceled"],
    picked_up: ["out_for_delivery", "canceled"],
    out_for_delivery: ["delivered", "canceled"],
    delivered: [],
    awaiting_pickup: ["picked_up_by_customer", "canceled"],
    picked_up_by_customer: [], served: [], canceled: [], not_required: [],
  },
} as const;

const allStates = {
  order: ["pending_confirmation", "confirmed", "rejected", "canceled", "completed"] as OrderStatus[],
  payment: ["pending", "authorized", "paid", "failed", "partially_refunded", "refunded"] as PaymentStatus[],
  production: ["pending_confirmation", "queued", "preparing", "ready", "canceled", "not_required"] as ProductionStatus[],
  fulfillment: ["pending", "awaiting_assignment", "assigned", "picked_up", "out_for_delivery", "delivered", "awaiting_pickup", "picked_up_by_customer", "served", "canceled", "not_required"] as FulfillmentStatus[],
};

describe("order state machines", () => {
  it("starts each lifecycle independently", () => {
    expect(initialOrderStates).toEqual({
      order: "pending_confirmation",
      payment: "pending",
      production: "pending_confirmation",
      fulfillment: "pending",
    });
  });

  for (const domain of Object.keys(matrix) as OrderStateDomain[]) {
    it(`matches the complete ${domain} transition matrix`, () => {
      const states = allStates[domain];
      for (const from of states) {
        for (const to of states) {
          const expected = from === to || (matrix[domain][from as never] as readonly string[]).includes(to);
          expect(canTransition(domain as never, from as never, to as never), `${domain}: ${from} -> ${to}`).toBe(expected);
          if (expected) {
            expect(() => assertTransition(domain as never, from as never, to as never)).not.toThrow();
          } else {
            expect(() => assertTransition(domain as never, from as never, to as never)).toThrow(`Invalid ${domain} transition`);
          }
        }
      }
    });
  }

  it("keeps the same state idempotent in every domain", () => {
    for (const domain of Object.keys(allStates) as OrderStateDomain[]) {
      for (const state of allStates[domain]) {
        expect(canTransition(domain as never, state as never, state as never)).toBe(true);
      }
    }
  });

  it("does not let production skip queued or preparing", () => {
    expect(canTransition("production", "pending_confirmation", "ready")).toBe(false);
    expect(canTransition("production", "queued", "ready")).toBe(false);
  });

  it("keeps refunded payments terminal and permits explicit retry only from failed", () => {
    expect(canTransition("payment", "failed", "pending")).toBe(true);
    expect(canTransition("payment", "refunded", "pending")).toBe(false);
  });

  it("recognizes every completed fulfillment mode", () => {
    for (const status of ["delivered", "picked_up_by_customer", "served", "not_required"] as FulfillmentStatus[]) {
      expect(fulfillmentIsComplete(status)).toBe(true);
    }
    for (const status of allStates.fulfillment.filter((value) => !["delivered", "picked_up_by_customer", "served", "not_required"].includes(value))) {
      expect(fulfillmentIsComplete(status)).toBe(false);
    }
  });
});
