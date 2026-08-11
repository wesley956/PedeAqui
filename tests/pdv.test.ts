import { describe, expect, it } from "vitest";
import {
  cartTotalCents,
  filterPosProducts,
  parsePosMoneyToCents,
  projectedUnitPriceCents,
  validateModifierSelection,
  type PosProduct,
} from "@/features/pdv/model";

const product: PosProduct = {
  id: "00000000-0000-4000-8000-000000000001",
  categoryId: "cat-lanches",
  name: "X-Salada Especial",
  description: "Pão, hambúrguer e queijo",
  sku: "XS-01",
  barcode: "789123",
  priceCents: 2500,
  modifierGroups: [
    {
      id: "g1",
      name: "Ponto da carne",
      minSelection: 1,
      maxSelection: 1,
      required: true,
      sortOrder: 0,
      modifiers: [
        { id: "m1", name: "Ao ponto", priceCents: 0 },
        { id: "m2", name: "Bem passada", priceCents: 0 },
      ],
    },
    {
      id: "g2",
      name: "Extras",
      minSelection: 0,
      maxSelection: 2,
      required: false,
      sortOrder: 1,
      modifiers: [
        { id: "m3", name: "Bacon", priceCents: 450 },
        { id: "m4", name: "Cheddar", priceCents: 300 },
        { id: "m5", name: "Ovo", priceCents: 250 },
      ],
    },
  ],
};

describe("PDV quick search", () => {
  it("matches accents, SKU and barcode", () => {
    expect(filterPosProducts([product], null, "hamburguer")).toHaveLength(1);
    expect(filterPosProducts([product], null, "xs-01")).toHaveLength(1);
    expect(filterPosProducts([product], null, "789123")).toHaveLength(1);
    expect(filterPosProducts([product], "outra", "")).toHaveLength(0);
  });
});

describe("PDV modifier projection", () => {
  it("requires the minimum selection and enforces group maximum", () => {
    expect(validateModifierSelection(product, [])).toMatchObject({ valid: false });
    expect(validateModifierSelection(product, ["m1", "m3", "m4"])).toEqual({ valid: true, message: null });
    expect(validateModifierSelection(product, ["m1", "m3", "m4", "m5"])).toMatchObject({ valid: false });
  });

  it("rejects unknown and duplicate modifiers", () => {
    expect(validateModifierSelection(product, ["m1", "unknown"])).toMatchObject({ valid: false });
    expect(validateModifierSelection(product, ["m1", "m1"])).toMatchObject({ valid: false });
  });

  it("projects modifier price without becoming server authority", () => {
    expect(projectedUnitPriceCents(product, ["m1", "m3", "m4"])).toBe(3250);
  });
});

describe("PDV cart and money", () => {
  it("sums projected cart lines in integer cents", () => {
    expect(cartTotalCents([
      { key: "1", productId: product.id, productName: product.name, quantity: 2, note: "", modifierIds: [], modifierLabels: [], unitPriceCents: 2500 },
      { key: "2", productId: product.id, productName: product.name, quantity: 1, note: "", modifierIds: ["m3"], modifierLabels: ["Bacon"], unitPriceCents: 2950 },
    ])).toBe(7950);
  });

  it("parses Brazilian and decimal money inputs", () => {
    expect(parsePosMoneyToCents("29,90")).toBe(2990);
    expect(parsePosMoneyToCents("1.234,56")).toBe(123456);
    expect(parsePosMoneyToCents("29.90")).toBe(2990);
    expect(parsePosMoneyToCents("29,999")).toBeNull();
  });
});
