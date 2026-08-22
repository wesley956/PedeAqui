import { describe, expect, it } from "vitest";
import { neighborhoodKey, normalizeLocationPart } from "@/server/delivery/location-key";
import { deliverySettingsInputSchema } from "@/server/delivery/schemas";
import { calculateDeliveryQuote } from "@/server/delivery/quote-calculator";

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

const quoteSettings = {
  enabled: true,
  fee_mode: "neighborhood" as const,
  default_fee_cents: 500,
  free_delivery_over_cents: 7000,
  estimated_min_minutes: 25,
  estimated_max_minutes: 45,
  require_neighborhood_match: true,
};

describe("delivery quote rules", () => {
  it("uses the configured neighborhood fee, minimum and additional ETA", () => {
    const result = calculateDeliveryQuote({
      subtotalCents: 5000,
      settings: quoteSettings,
      neighborhood: { fee_cents: 400, minimum_order_cents: 2000, additional_minutes: 5 },
    });
    expect(result).toEqual({ serviceable: true, feeCents: 400, estimatedMinMinutes: 30, estimatedMaxMinutes: 50 });
  });

  it("blocks an unknown required neighborhood and a subtotal below its minimum", () => {
    expect(calculateDeliveryQuote({ subtotalCents: 5000, settings: quoteSettings, neighborhood: null }))
      .toEqual({ serviceable: false, reason: "neighborhood_not_served" });
    expect(calculateDeliveryQuote({
      subtotalCents: 1999,
      settings: quoteSettings,
      neighborhood: { fee_cents: 400, minimum_order_cents: 2000, additional_minutes: 0 },
    })).toEqual({ serviceable: false, reason: "minimum_order", minimumOrderCents: 2000 });
  });

  it("applies free delivery and the default fee mode deterministically", () => {
    expect(calculateDeliveryQuote({
      subtotalCents: 7000,
      settings: quoteSettings,
      neighborhood: { fee_cents: 900, minimum_order_cents: 0, additional_minutes: 0 },
    })).toMatchObject({ serviceable: true, feeCents: 0 });
    expect(calculateDeliveryQuote({
      subtotalCents: 5000,
      settings: { ...quoteSettings, fee_mode: "default", require_neighborhood_match: false },
      neighborhood: null,
    })).toMatchObject({ serviceable: true, feeCents: 500 });
  });

  it("rejects unsafe monetary input instead of producing a quote", () => {
    expect(() => calculateDeliveryQuote({ subtotalCents: -1, settings: quoteSettings, neighborhood: null })).toThrow("Invalid delivery quote subtotal");
  });
});
