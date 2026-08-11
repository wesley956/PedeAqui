import { describe, expect, it } from "vitest";
import {
  modifierGroupInputSchema,
  productInputSchema,
} from "@/server/catalog/schemas";
import { parseMoneyToCents } from "@/server/catalog/money";

describe("catalog money", () => {
  it("parses Brazilian decimal format", () => {
    expect(parseMoneyToCents("29,90")).toBe(2990);
    expect(parseMoneyToCents("1.234,56")).toBe(123456);
  });

  it("parses dot decimal format", () => {
    expect(parseMoneyToCents("29.90")).toBe(2990);
    expect(parseMoneyToCents("10")).toBe(1000);
  });

  it("rejects malformed money", () => {
    expect(() => parseMoneyToCents("29,999")).toThrow();
    expect(() => parseMoneyToCents("-1,00")).toThrow();
  });
});

describe("product schema", () => {
  it("rejects promotional price above regular price", () => {
    const result = productInputSchema.safeParse({
      name: "X-Bacon",
      priceCents: 2500,
      promotionalPriceCents: 3000,
      preparationTimeMinutes: 10,
      active: true,
      availability: "available",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a valid product", () => {
    const result = productInputSchema.safeParse({
      name: "X-Bacon",
      priceCents: 2990,
      promotionalPriceCents: 2490,
      preparationTimeMinutes: 10,
      active: true,
      availability: "available",
    });
    expect(result.success).toBe(true);
  });
});

describe("modifier group schema", () => {
  it("rejects min above max", () => {
    expect(modifierGroupInputSchema.safeParse({
      name: "Molhos",
      minSelection: 3,
      maxSelection: 2,
      required: true,
      sortOrder: 0,
      active: true,
    }).success).toBe(false);
  });

  it("requires at least one selection when required", () => {
    expect(modifierGroupInputSchema.safeParse({
      name: "Escolha a bebida",
      minSelection: 0,
      maxSelection: 1,
      required: true,
      sortOrder: 0,
      active: true,
    }).success).toBe(false);
  });
});
