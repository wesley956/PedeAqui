import { describe, expect, it } from "vitest";
import { exampleMotorbikeDistanceBands, quoteDistanceFee, validateDistanceFeeBands } from "@/server/delivery/distance-fee-bands";

describe("shared delivery distance fee bands", () => {
  it("maps the example table to exact bands and rounds 3.6 km into the 4 km band", () => {
    expect(quoteDistanceFee(1, exampleMotorbikeDistanceBands)).toBe(300);
    expect(quoteDistanceFee(3.6, exampleMotorbikeDistanceBands)).toBe(600);
    expect(quoteDistanceFee(10, exampleMotorbikeDistanceBands)).toBe(1200);
  });
  it("returns unavailable outside coverage instead of free delivery", () => {
    expect(quoteDistanceFee(10.01, exampleMotorbikeDistanceBands)).toBeNull();
  });
  it("permits individually configured non-linear prices", () => {
    expect(quoteDistanceFee(2.1, [{ upToKm: 2, feeCents: 350 }, { upToKm: 4, feeCents: 675 }])).toBe(675);
  });
  it("rejects invalid distances and bands", () => {
    expect(() => quoteDistanceFee(-1, exampleMotorbikeDistanceBands)).toThrow();
    expect(() => quoteDistanceFee(Number.NaN, exampleMotorbikeDistanceBands)).toThrow();
    expect(() => validateDistanceFeeBands([])).toThrow();
    expect(() => validateDistanceFeeBands([{ upToKm: 2, feeCents: 300 }, { upToKm: 1, feeCents: 400 }])).toThrow();
    expect(() => validateDistanceFeeBands([{ upToKm: 1, feeCents: -100 }])).toThrow();
  });
});
