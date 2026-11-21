import { describe, expect, it } from "vitest";
import { priceDeliveryDistanceCents } from "@/server/delivery/distance-pricing";

describe("Jack delivery road distance pricing", () => {
  it.each([
    [0, 400],
    [1000, 400],
    [1000.1, 500],
    [2000, 500],
    [2001, 600],
    [3400, 700],
    [5000, 800],
  ])("prices %s meters at %s cents", (meters, expected) => {
    expect(priceDeliveryDistanceCents(meters)).toBe(expected);
  });
  it("refuses an unavailable or out-of-range route", () => {
    for (const meters of [-1, Number.NaN, Number.POSITIVE_INFINITY, 30001]) {
      expect(() => priceDeliveryDistanceCents(meters)).toThrow();
    }
  });
  it("allows later per-store pricing configuration without rounding down", () => {
    expect(priceDeliveryDistanceCents(1400, { firstKmCents: 500, additionalKmCents: 200 })).toBe(700);
  });
});
