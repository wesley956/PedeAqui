import { describe, expect, it } from "vitest";
import { PricingError, PricingService, type PricingProduct } from "@/server/pricing/pricing-service";

function product(overrides: Partial<PricingProduct["modifierGroups"][number]> = {}): PricingProduct {
  const group = {
    id: "group-1",
    name: "Sabores da caixa",
    minSelection: 1,
    maxSelection: 7,
    required: true,
    selectionMode: "equal_split_options" as const,
    distributionTotal: 50,
    modifiers: ["Coxinha", "Bolinha", "Kibe", "Risole", "Queijo", "Carne", "Frango"].map((name, index) => ({
      id: `m${index + 1}`,
      groupId: "group-1",
      groupName: "Sabores da caixa",
      name,
      priceCents: 0,
    })),
    ...overrides,
  };

  return {
    id: "product-1",
    name: "Caixa com 50 salgados",
    imageUrl: null,
    priceCents: 3500,
    promotionalPriceCents: null,
    available: true,
    modifierGroups: [group],
  };
}

describe("equal split modifier mode", () => {
  it("splits 50 deterministically across four selected options", () => {
    const priced = PricingService.priceItem(product(), [
      { modifierId: "m1", quantity: 1 },
      { modifierId: "m2", quantity: 1 },
      { modifierId: "m3", quantity: 1 },
      { modifierId: "m4", quantity: 1 },
    ], 1);

    expect(priced.modifiers.map((modifier) => modifier.quantity)).toEqual([13, 13, 12, 12]);
    expect(priced.modifiers.reduce((sum, modifier) => sum + modifier.quantity, 0)).toBe(50);
  });

  it("recalculates browser-supplied quantities instead of trusting them", () => {
    const priced = PricingService.priceItem(product(), [
      { modifierId: "m1", quantity: 40 },
      { modifierId: "m2", quantity: 10 },
      { modifierId: "m3", quantity: 7 },
    ], 1);

    expect(priced.modifiers.map((modifier) => modifier.quantity)).toEqual([17, 17, 16]);
  });

  it("preserves manual quantity mode semantics", () => {
    const priced = PricingService.priceItem(product({
      selectionMode: "quantity_per_option",
      minSelection: 1,
      maxSelection: 50,
      distributionTotal: null,
    }), [
      { modifierId: "m1", quantity: 20 },
      { modifierId: "m2", quantity: 10 },
    ], 1);

    expect(priced.modifiers.map((modifier) => modifier.quantity)).toEqual([20, 10]);
  });

  it("rejects invalid equal split configuration", () => {
    expect(() => PricingService.priceItem(product({ distributionTotal: null }), [{ modifierId: "m1", quantity: 1 }], 1))
      .toThrow(PricingError);
  });

  it("enforces minimum and maximum distinct options", () => {
    expect(() => PricingService.priceItem(product({ minSelection: 2, maxSelection: 4 }), [{ modifierId: "m1", quantity: 1 }], 1))
      .toThrow(PricingError);

    expect(() => PricingService.priceItem(product({ maxSelection: 2 }), [
      { modifierId: "m1", quantity: 1 },
      { modifierId: "m2", quantity: 1 },
      { modifierId: "m3", quantity: 1 },
    ], 1)).toThrow(PricingError);
  });
});
