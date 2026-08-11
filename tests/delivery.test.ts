import { describe, expect, it } from "vitest";
import { neighborhoodKey, normalizeLocationPart } from "@/server/delivery/location-key";
import { deliverySettingsInputSchema } from "@/server/delivery/schemas";

describe("delivery location keys", () => {
  it("normalizes accents and spacing consistently", () => {
    expect(normalizeLocationPart("  São Manoel  ")).toBe("sao-manoel");
    expect(neighborhoodKey("São Manoel", "Nova Odessa", "SP")).toBe("sao-manoel|nova-odessa|sp");
  });
});

describe("delivery settings", () => {
  it("rejects an inverted ETA range", () => {
    expect(() => deliverySettingsInputSchema.parse({
      enabled: true,
      feeMode: "neighborhood",
      defaultFeeCents: 500,
      estimatedMinMinutes: 70,
      estimatedMaxMinutes: 40,
      requireNeighborhoodMatch: true,
    })).toThrow();
  });

  it("accepts free delivery threshold", () => {
    const parsed = deliverySettingsInputSchema.parse({
      enabled: true,
      feeMode: "default",
      defaultFeeCents: 700,
      freeDeliveryOverCents: 8000,
      estimatedMinMinutes: 30,
      estimatedMaxMinutes: 50,
      requireNeighborhoodMatch: false,
    });
    expect(parsed.freeDeliveryOverCents).toBe(8000);
  });
});
