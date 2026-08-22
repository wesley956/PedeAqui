export type PricingModifier = {
  id: string;
  groupId: string;
  groupName: string;
  name: string;
  priceCents: number;
};

export type PricingModifierGroup = {
  id: string;
  name: string;
  minSelection: number;
  maxSelection: number;
  required: boolean;
  modifiers: PricingModifier[];
};

export type PricingProduct = {
  id: string;
  name: string;
  imageUrl: string | null;
  priceCents: number;
  promotionalPriceCents: number | null;
  available: boolean;
  modifierGroups: PricingModifierGroup[];
};

export type PricedModifierSnapshot = {
  group_id: string;
  group_name: string;
  modifier_id: string;
  modifier_name: string;
  unit_price_cents: number;
};

export class PricingError extends Error {
  constructor(public readonly code: "product_unavailable" | "store_unavailable" | "invalid_modifiers" | "invalid_quantity" | "unsafe_total", message: string) {
    super(message);
    this.name = "PricingError";
  }
}

function assertCents(value: number) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new PricingError("unsafe_total", "Invalid monetary value");
  }
  return value;
}

export class PricingService {
  static priceItem(product: PricingProduct, selectedModifierIds: string[], quantity: number) {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw new PricingError("invalid_quantity", "Quantity must be between 1 and 99");
    }
    if (!product.available) {
      throw new PricingError("product_unavailable", "Product is unavailable");
    }

    const uniqueSelected = [...new Set(selectedModifierIds)];
    if (uniqueSelected.length !== selectedModifierIds.length) {
      throw new PricingError("invalid_modifiers", "Duplicate modifier selection");
    }

    const allowedIds = new Set(product.modifierGroups.flatMap((group) => group.modifiers.map((modifier) => modifier.id)));
    if (uniqueSelected.some((id) => !allowedIds.has(id))) {
      throw new PricingError("invalid_modifiers", "Modifier does not belong to this product");
    }

    const snapshots: PricedModifierSnapshot[] = [];
    for (const group of product.modifierGroups) {
      const selected = group.modifiers.filter((modifier) => uniqueSelected.includes(modifier.id));
      const minimum = group.required ? Math.max(1, group.minSelection) : group.minSelection;
      if (selected.length < minimum || selected.length > group.maxSelection) {
        throw new PricingError("invalid_modifiers", `Invalid selection for ${group.name}`);
      }
      for (const modifier of selected) {
        snapshots.push({
          group_id: group.id,
          group_name: group.name,
          modifier_id: modifier.id,
          modifier_name: modifier.name,
          unit_price_cents: assertCents(modifier.priceCents),
        });
      }
    }

    const baseUnitPriceCents = assertCents(product.promotionalPriceCents ?? product.priceCents);
    const modifiersUnitPriceCents = assertCents(snapshots.reduce((sum, modifier) => sum + modifier.unit_price_cents, 0));
    const unitTotalPriceCents = assertCents(baseUnitPriceCents + modifiersUnitPriceCents);
    const lineTotalCents = assertCents(unitTotalPriceCents * quantity);

    return {
      baseUnitPriceCents,
      modifiersUnitPriceCents,
      unitTotalPriceCents,
      lineTotalCents,
      modifiers: snapshots,
    };
  }

  static totalCart(lines: Array<{ lineTotalCents: number }>) {
    return assertCents(lines.reduce((sum, line) => sum + assertCents(line.lineTotalCents), 0));
  }
}
