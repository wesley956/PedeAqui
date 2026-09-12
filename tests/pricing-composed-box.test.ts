import { describe, expect, it } from "vitest";
import { PricingService, type PricingProduct } from "@/server/pricing/pricing-service";

const product: PricingProduct = {
  id: "product-30",
  name: "Caixa com 30 salgados",
  imageUrl: null,
  priceCents: 3000,
  promotionalPriceCents: null,
  available: true,
  modifierGroups: [{
    id: "sabores",
    name: "Sabores",
    minSelection: 1,
    maxSelection: 7,
    required: true,
    selectionMode: "equal_split_options",
    distributionTotal: 30,
    modifiers: [
      { id: "coxinha", groupId: "sabores", groupName: "Sabores", name: "Coxinha de frango", priceCents: 0 },
      { id: "bolinha", groupId: "sabores", groupName: "Sabores", name: "Bolinha de queijo", priceCents: 0 },
      { id: "salsicha", groupId: "sabores", groupName: "Sabores", name: "Salsicha", priceCents: 0 },
    ],
  }],
};

describe("PricingService composed boxes", () => {
  it("preserves an explicit composition when quantities already total the configured box", () => {
    const priced = PricingService.priceItem(product, [
      { modifierId: "coxinha", quantity: 15 },
      { modifierId: "bolinha", quantity: 10 },
      { modifierId: "salsicha", quantity: 5 },
    ], 1);
    expect(priced.modifiers.map((item) => [item.modifier_id, item.quantity])).toEqual([
      ["coxinha", 15], ["bolinha", 10], ["salsicha", 5],
    ]);
  });

  it("keeps the old equal-distribution behavior for ordinary option selection", () => {
    const priced = PricingService.priceItem(product, ["coxinha", "bolinha", "salsicha"], 1);
    expect(priced.modifiers.map((item) => item.quantity)).toEqual([10, 10, 10]);
  });
});
