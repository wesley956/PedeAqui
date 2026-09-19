import { describe, expect, it } from "vitest";
import {
  buildModifierGroupPrompt,
  createPendingModifierFlow,
  firstPendingModifierGroup,
  resolveModifierGroupInput,
} from "@/server/conversations/whatsapp-modifier-flow";
import type { CatalogProductDetails } from "@/server/intelligence/catalog-adapter";

function details(): CatalogProductDetails {
  return {
    id: "71000000-0000-4000-8000-000000000010",
    name: "Opala - XSalada",
    description: null,
    imageUrl: null,
    regularPriceCents: 2500,
    effectivePriceCents: 2500,
    promotionLabel: null,
    preparationTimeMinutes: 20,
    availability: "available",
    sellable: true,
    operational: { scheduleOpen: true, acceptingOrders: true, canOrder: true, label: "open" },
    modifierGroups: [
      {
        id: "71000000-0000-4000-8000-000000000020",
        name: "Escolha o pão",
        description: null,
        required: true,
        minSelection: 1,
        maxSelection: 1,
        selectionMode: "distinct_choices",
        distributionTotal: null,
        modifiers: [
          { id: "71000000-0000-4000-8000-000000000030", name: "Pão Brioche", priceCents: 0 },
          { id: "71000000-0000-4000-8000-000000000031", name: "Pão Francês", priceCents: 0 },
        ],
      },
      {
        id: "71000000-0000-4000-8000-000000000021",
        name: "Turbine seu lanche",
        description: null,
        required: false,
        minSelection: 0,
        maxSelection: 8,
        selectionMode: "distinct_choices",
        distributionTotal: null,
        modifiers: [
          { id: "71000000-0000-4000-8000-000000000032", name: "Bacon", priceCents: 500 },
          { id: "71000000-0000-4000-8000-000000000033", name: "Ovo", priceCents: 300 },
        ],
      },
    ],
    gas: null,
    projection: { businessType: "restaurant", catalogLabel: "cardápio", itemLabel: "item", optionLabel: "adicional" },
  };
}

describe("WhatsApp canonical modifier flow", () => {
  it("starts at the first canonical group and advances by completed group ids", () => {
    const product = details();
    const pending = createPendingModifierFlow(product, 2);
    expect(pending).toMatchObject({ quantity: 2, currentGroupId: product.modifierGroups[0]!.id });
    expect(firstPendingModifierGroup(product, [product.modifierGroups[0]!.id])?.id).toBe(product.modifierGroups[1]!.id);
  });

  it("accepts numeric selection for a required distinct-choice group", () => {
    const group = details().modifierGroups[0]!;
    expect(resolveModifierGroupInput("1", group)).toEqual({ ok: true, selections: [{ modifierId: group.modifiers[0]!.id, quantity: 1 }] });
  });

  it("refuses skipping a required group", () => {
    const group = details().modifierGroups[0]!;
    const result = resolveModifierGroupInput("0", group);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("obrigatório");
  });

  it("allows an optional paid-addition group to be skipped", () => {
    const group = details().modifierGroups[1]!;
    expect(resolveModifierGroupInput("sem", group)).toEqual({ ok: true, selections: [] });
  });

  it("accepts multiple paid additions and keeps canonical modifier ids", () => {
    const group = details().modifierGroups[1]!;
    expect(resolveModifierGroupInput("Bacon, Ovo", group)).toEqual({
      ok: true,
      selections: [
        { modifierId: group.modifiers[0]!.id, quantity: 1 },
        { modifierId: group.modifiers[1]!.id, quantity: 1 },
      ],
    });
  });

  it("shows canonical paid prices in the prompt", () => {
    const prompt = buildModifierGroupPrompt(details().name, details().modifierGroups[1]!);
    expect(prompt).toContain("Bacon (+R$");
    expect(prompt).toContain("5,00");
    expect(prompt).toContain("0 — Sem adicional / pular");
  });

  it("validates exact equal-split totals and canonical flavor names", () => {
    const group: CatalogProductDetails["modifierGroups"][number] = {
      id: "71000000-0000-4000-8000-000000000040",
      name: "Sabores",
      description: null,
      required: true,
      minSelection: 1,
      maxSelection: 6,
      selectionMode: "equal_split_options",
      distributionTotal: 100,
      modifiers: [
        { id: "71000000-0000-4000-8000-000000000041", name: "Carne", priceCents: 0 },
        { id: "71000000-0000-4000-8000-000000000042", name: "Queijo", priceCents: 0 },
      ],
    };
    expect(resolveModifierGroupInput("50 carne, 50 queijo", group)).toEqual({
      ok: true,
      selections: [
        { modifierId: group.modifiers[0]!.id, quantity: 50 },
        { modifierId: group.modifiers[1]!.id, quantity: 50 },
      ],
    });
    const invalid = resolveModifierGroupInput("40 carne, 40 queijo", group);
    expect(invalid.ok).toBe(false);
  });

  it("supports quantity-per-option limits", () => {
    const group: CatalogProductDetails["modifierGroups"][number] = {
      id: "71000000-0000-4000-8000-000000000050",
      name: "Extras",
      description: null,
      required: true,
      minSelection: 1,
      maxSelection: 3,
      selectionMode: "quantity_per_option",
      distributionTotal: null,
      modifiers: [
        { id: "71000000-0000-4000-8000-000000000051", name: "Bacon", priceCents: 500 },
        { id: "71000000-0000-4000-8000-000000000052", name: "Queijo", priceCents: 300 },
      ],
    };
    expect(resolveModifierGroupInput("2 bacon, 1 queijo", group)).toEqual({
      ok: true,
      selections: [
        { modifierId: group.modifiers[0]!.id, quantity: 2 },
        { modifierId: group.modifiers[1]!.id, quantity: 1 },
      ],
    });
    expect(resolveModifierGroupInput("3 bacon, 1 queijo", group).ok).toBe(false);
  });
});
