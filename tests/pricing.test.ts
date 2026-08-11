import { describe, expect, it } from "vitest";
import { PricingError, PricingService, type PricingProduct } from "@/server/pricing/pricing-service";

const cheddarId = "00000000-0000-0000-0000-000000000011";
const pratoId = "00000000-0000-0000-0000-000000000012";
const baconId = "00000000-0000-0000-0000-000000000021";

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
        { id: cheddarId, groupId: "00000000-0000-0000-0000-000000000010", groupName: "Queijo", name: "Cheddar", priceCents: 300 },
        { id: pratoId, groupId: "00000000-0000-0000-0000-000000000010", groupName: "Queijo", name: "Prato", priceCents: 0 },
      ],
    },
    {
      id: "00000000-0000-0000-0000-000000000020",
      name: "Extras",
      minSelection: 0,
      maxSelection: 2,
      required: false,
      modifiers: [
        { id: baconId, groupId: "00000000-0000-0000-0000-000000000020", groupName: "Extras", name: "Bacon extra", priceCents: 500 },
      ],
    },
  ],
};

function expectPricingError(fn: () => unknown, code: PricingError["code"]) {
  try {
    fn();
    throw new Error("Expected PricingError");
  } catch (error) {
    expect(error).toBeInstanceOf(PricingError);
    expect((error as PricingError).code).toBe(code);
  }
}

describe("PricingService", () => {
  it("uses promotional price and modifiers using integer cents", () => {
    const result = PricingService.priceItem(product, [cheddarId, baconId], 2);
    expect(result.baseUnitPriceCents).toBe(2500);
    expect(result.modifiersUnitPriceCents).toBe(800);
    expect(result.unitTotalPriceCents).toBe(3300);
    expect(result.lineTotalCents).toBe(6600);
    expect(result.modifiers.map((modifier) => modifier.modifier_id)).toEqual([cheddarId, baconId]);
  });

  it("accepts zero promotional price as a valid explicit price", () => {
    const result = PricingService.priceItem({ ...product, promotionalPriceCents: 0 }, [pratoId], 1);
    expect(result.baseUnitPriceCents).toBe(0);
    expect(result.lineTotalCents).toBe(0);
  });

  it("rejects a missing required modifier", () => {
    expectPricingError(() => PricingService.priceItem(product, [], 1), "invalid_modifiers");
  });

  it("rejects too many choices from one group", () => {
    expectPricingError(() => PricingService.priceItem(product, [cheddarId, pratoId], 1), "invalid_modifiers");
  });

  it("rejects a modifier that does not belong to the product", () => {
    expectPricingError(() => PricingService.priceItem(product, ["00000000-0000-0000-0000-000000000099"], 1), "invalid_modifiers");
  });

  it("rejects duplicated modifiers instead of charging twice", () => {
    expectPricingError(() => PricingService.priceItem(product, [cheddarId, cheddarId], 1), "invalid_modifiers");
  });

  it("rejects unavailable products", () => {
    expectPricingError(() => PricingService.priceItem({ ...product, available: false }, [cheddarId], 1), "product_unavailable");
  });

  it.each([0, -1, 100, 1.5, Number.NaN])("rejects invalid quantity %s", (quantity) => {
    expectPricingError(() => PricingService.priceItem(product, [cheddarId], quantity), "invalid_quantity");
  });

  it("rejects negative base or modifier cents", () => {
    expectPricingError(() => PricingService.priceItem({ ...product, promotionalPriceCents: -1 }, [cheddarId], 1), "unsafe_total");
    const [firstGroup] = product.modifierGroups;
    const [firstModifier] = firstGroup?.modifiers ?? [];
    if (!firstGroup || !firstModifier) throw new Error("Pricing fixture is incomplete");
    const unsafeModifierProduct: PricingProduct = {
      ...product,
      modifierGroups: [{ ...firstGroup, modifiers: [{ ...firstModifier, priceCents: -1 }] }],
    };
    expectPricingError(() => PricingService.priceItem(unsafeModifierProduct, [cheddarId], 1), "unsafe_total");
  });

  it("rejects unsafe integer arithmetic instead of overflowing money", () => {
    expectPricingError(
      () => PricingService.priceItem({ ...product, priceCents: Number.MAX_SAFE_INTEGER, promotionalPriceCents: null }, [cheddarId], 99),
      "unsafe_total",
    );
  });

  it("sums cart lines without float arithmetic", () => {
    expect(PricingService.totalCart([{ lineTotalCents: 1999 }, { lineTotalCents: 2301 }])).toBe(4300);
  });

  it("rejects negative and overflowing cart totals", () => {
    expectPricingError(() => PricingService.totalCart([{ lineTotalCents: -1 }]), "unsafe_total");
    expectPricingError(
      () => PricingService.totalCart([{ lineTotalCents: Number.MAX_SAFE_INTEGER }, { lineTotalCents: 1 }]),
      "unsafe_total",
    );
  });
});
