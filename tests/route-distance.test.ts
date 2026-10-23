import { describe, expect, it } from "vitest";
import { roadRouteKilometers } from "@/server/delivery/route-distance";
import { quoteDistanceFee, exampleMotorbikeDistanceBands } from "@/server/delivery/distance-fee-bands";

describe("trusted delivery road-route distance", () => {
  it("converts provider meters to configured tariff bands", () => {
    const km = roadRouteKilometers({ provider: "routing-service", distanceMeters: 3600 });
    expect(km).toBe(3.6);
    expect(quoteDistanceFee(km, exampleMotorbikeDistanceBands)).toBe(600);
  });
  it("rejects incomplete, negative, fractional, and invalid provider measurements", () => {
    expect(() => roadRouteKilometers({ provider: "", distanceMeters: 3600 })).toThrow();
    expect(() => roadRouteKilometers({ provider: "provider", distanceMeters: -1 })).toThrow();
    expect(() => roadRouteKilometers({ provider: "provider", distanceMeters: 1.5 })).toThrow();
    expect(() => roadRouteKilometers({ provider: "provider", distanceMeters: Infinity })).toThrow();
  });
});
