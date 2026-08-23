import { describe, expect, it } from "vitest";
import { PricingError, PricingService, type PricingProduct } from "@/server/pricing/pricing-service";

const cheddarId = "00000000-0000-0000-0000-000000000011";
const pratoId = "00000000-0000-0000-0000-000000000012";
const baconId = "00000000-0000-0000-0000-000000000021";
const coxinhaId = "00000000-0000-0000-0000-000000000031";
const kibeId = "00000000-0000-0000-0000-000000000032";

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

const cupProduct: PricingProduct = {
  id: "00000000-0000-0000-0000-000000000003",
  name: "Copo com até 13 salgados",
  imageUrl: null,
  priceCents: 1800,
  promotionalPriceCents: null,
  available: true,
  modifierGroups: [{
    id: "00000000-0000-0000-0000-000000000030",
    name: "Sabores",
    minSelection: 1,
    maxSelection: 13,
    required: true,
    selectionMode: "quantity_per_option",
    modifiers: [
      { id: coxinhaId, groupId: "00000000-0000-0000-0000-000000000030", groupName: "Sabores", name: "Coxinha", priceCents: 0 },
      { id: kibeId, groupId: "00000000-0000-0000-0000-000000000030", groupName: "Sabores", name: "Kibe", priceCents: 50 },
    ],
  }],
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
    expect(result.modifiers.every((modifier) => modifier.quantity === 1)).toBe(true);
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

  it("keeps legacy distinct choices at quantity one", () => {
    expectPricingError(() => PricingService.priceItem(product, [{ modifierId: cheddarId, quantity: 2 }], 1), "invalid_modifiers");
  });

  it.each([1, 7, 13])("accepts aggregate quantity %s without requiring the maximum", (total) => {
    const result = PricingService.priceItem(cupProduct, [{ modifierId: coxinhaId, quantity: total }], 1);
    expect(result.modifiers[0]?.quantity).toBe(total);
    expect(result.lineTotalCents).toBe(1800);
  });

  it("accepts 5 Coxinhas + 2 Kibes and prices paid flavor quantities", () => {
    const result = PricingService.priceItem(cupProduct, [
      { modifierId: coxinhaId, quantity: 5 },
      { modifierId: kibeId, quantity: 2 },
    ], 1);
    expect(result.modifiersUnitPriceCents).toBe(100);
    expect(result.unitTotalPriceCents).toBe(1900);
    expect(result.lineTotalCents).toBe(1900);
    expect(result.modifiers.map((modifier) => [modifier.modifier_name, modifier.quantity])).toEqual([["Coxinha", 5], ["Kibe", 2]]);
  });

  it("multiplies the assembled unit by product quantity without confusing flavor quantities", () => {
    const result = PricingService.priceItem(cupProduct, [
      { modifierId: coxinhaId, quantity: 5 },
      { modifierId: kibeId, quantity: 2 },
    ], 2);
    expect(result.unitTotalPriceCents).toBe(1900);
    expect(result.lineTotalCents).toBe(3800);
    expect(result.modifiers.find((modifier) => modifier.modifier_id === coxinhaId)?.quantity).toBe(5);
  });

  it("rejects quantity zero by omission and aggregate above max", () => {
    expectPricingError(() => PricingService.priceItem(cupProduct, [], 1), "invalid_modifiers");
    expectPricingError(() => PricingService.priceItem(cupProduct, [{ modifierId: coxinhaId, quantity: 14 }], 1), "invalid_modifiers");
  });

  it("allows zero selections when quantity group is optional with min zero", () => {
    const optionalCup: PricingProduct = { ...cupProduct, modifierGroups: [{ ...cupProduct.modifierGroups[0]!, minSelection: 0, required: false }] };
    const result = PricingService.priceItem(optionalCup, [], 1);
    expect(result.lineTotalCents).toBe(1800);
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
    const unsafeModifierProduct: PricingProduct = { ...product, modifierGroups: [{ ...firstGroup, modifiers: [{ ...firstModifier, priceCents: -1 }] }] };
    expectPricingError(() => PricingService.priceItem(unsafeModifierProduct, [cheddarId], 1), "unsafe_total");
  });

  it("rejects unsafe integer arithmetic instead of overflowing money", () => {
    expectPricingError(() => PricingService.priceItem({ ...product, priceCents: Number.MAX_SAFE_INTEGER, promotionalPriceCents: null }, [cheddarId], 99), "unsafe_total");
  });

  it("sums cart lines without float arithmetic", () => {
    expect(PricingService.totalCart([{ lineTotalCents: 1999 }, { lineTotalCents: 2301 }])).toBe(4300);
  });

  it("rejects negative and overflowing cart totals", () => {
    expectPricingError(() => PricingService.totalCart([{ lineTotalCents: -1 }]), "unsafe_total");
    expectPricingError(() => PricingService.totalCart([{ lineTotalCents: Number.MAX_SAFE_INTEGER }, { lineTotalCents: 1 }]), "unsafe_total");
  });
});
