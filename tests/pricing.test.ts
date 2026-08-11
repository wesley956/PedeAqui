import { describe, expect, it } from "vitest";
import { PricingError, PricingService, type PricingProduct } from "@/server/pricing/pricing-service";

const product: PricingProduct = {
  id: "00000000-0000-0000-0000-000000000001",
  name: "X-Bacon",
  imageUrl: null,
  priceCents: 3000,
  promotionalPriceCents: 2500,
  available: true,
  modifierGroups: [
    {
      id: "00000000-0000-0000-0000-000000000010",
      name: "Queijo",
      minSelection: 1,
      maxSelection: 1,
      required: true,
      modifiers: [
        { id: "00000000-0000-0000-0000-000000000011", groupId: "00000000-0000-0000-0000-000000000010", groupName: "Queijo", name: "Cheddar", priceCents: 300 },
        { id: "00000000-0000-0000-0000-000000000012", groupId: "00000000-0000-0000-0000-000000000010", groupName: "Queijo", name: "Prato", priceCents: 0 },
      ],
    },
    {
      id: "00000000-0000-0000-0000-000000000020",
      name: "Extras",
      minSelection: 0,
      maxSelection: 2,
      required: false,
      modifiers: [
        { id: "00000000-0000-0000-0000-000000000021", groupId: "00000000-0000-0000-0000-000000000020", groupName: "Extras", name: "Bacon extra", priceCents: 500 },
      ],
    },
  ],
};

describe("PricingService", () => {
  it("uses promotional price and modifiers using integer cents", () => {
    const result = PricingService.priceItem(product, [
      "00000000-0000-0000-0000-000000000011",
      "00000000-0000-0000-0000-000000000021",
    ], 2);

    expect(result.baseUnitPriceCents).toBe(2500);
    expect(result.modifiersUnitPriceCents).toBe(800);
    expect(result.unitTotalPriceCents).toBe(3300);
    expect(result.lineTotalCents).toBe(6600);
  });

  it("rejects a missing required modifier", () => {
    expect(() => PricingService.priceItem(product, [], 1)).toThrow(PricingError);
  });

  it("rejects a modifier that does not belong to the product", () => {
    expect(() => PricingService.priceItem(product, ["00000000-0000-0000-0000-000000000099"], 1)).toThrow("Modifier does not belong to this product");
  });

  it("rejects duplicated modifiers instead of charging twice", () => {
    const id = "00000000-0000-0000-0000-000000000011";
    expect(() => PricingService.priceItem(product, [id, id], 1)).toThrow("Duplicate modifier selection");
  });

  it("rejects unavailable products", () => {
    expect(() => PricingService.priceItem({ ...product, available: false }, ["00000000-0000-0000-0000-000000000011"], 1)).toThrow("Product is unavailable");
  });

  it("sums cart lines without float arithmetic", () => {
    expect(PricingService.totalCart([{ lineTotalCents: 1999 }, { lineTotalCents: 2301 }])).toBe(4300);
  });
});
