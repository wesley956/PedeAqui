export type ModifierSelectionMode = "distinct_choices" | "quantity_per_option" | "equal_split_options";

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
  selectionMode?: ModifierSelectionMode;
  distributionTotal?: number | null;
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

export type ModifierSelection = {
  modifierId: string;
  quantity: number;
};

export type PricedModifierSnapshot = {
  group_id: string;
  group_name: string;
  modifier_id: string;
  modifier_name: string;
  unit_price_cents: number;
  quantity: number;
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

function normalizeSelections(input: string[] | ModifierSelection[]): ModifierSelection[] {
  const selections = input.map((entry) => typeof entry === "string" ? { modifierId: entry, quantity: 1 } : entry);
  const ids = selections.map((selection) => selection.modifierId);
  if (new Set(ids).size !== ids.length) {
    throw new PricingError("invalid_modifiers", "Duplicate modifier selection");
  }
  for (const selection of selections) {
    if (!Number.isInteger(selection.quantity) || selection.quantity < 1 || selection.quantity > 100) {
      throw new PricingError("invalid_modifiers", "Invalid modifier quantity");
    }
  }
  return selections;
}

function distributeEqually<T extends { quantity: number }>(selected: T[], total: number): T[] {
  if (selected.length === 0) return selected;
  const base = Math.floor(total / selected.length);
  const remainder = total % selected.length;
  return selected.map((selection, index) => ({ ...selection, quantity: base + (index < remainder ? 1 : 0) }));
}

export class PricingService {
  static priceItem(product: PricingProduct, selectedModifiers: string[] | ModifierSelection[], quantity: number) {
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
      throw new PricingError("invalid_quantity", "Quantity must be between 1 and 99");
    }
    if (!product.available) {
      throw new PricingError("product_unavailable", "Product is unavailable");
    }

    const selections = normalizeSelections(selectedModifiers);
    const allowedIds = new Set(product.modifierGroups.flatMap((group) => group.modifiers.map((modifier) => modifier.id)));
    if (selections.some((selection) => !allowedIds.has(selection.modifierId))) {
      throw new PricingError("invalid_modifiers", "Modifier does not belong to this product");
    }
    const selectionById = new Map(selections.map((selection) => [selection.modifierId, selection]));

    const snapshots: PricedModifierSnapshot[] = [];
    for (const group of product.modifierGroups) {
      const mode = group.selectionMode ?? "distinct_choices";
      let selected = group.modifiers.flatMap((modifier) => {
        const selection = selectionById.get(modifier.id);
        return selection ? [{ modifier, quantity: selection.quantity }] : [];
      });

      if (mode === "equal_split_options") {
        const minimumDistinct = group.required ? Math.max(1, group.minSelection) : group.minSelection;
        const total = group.distributionTotal;
        if (selected.length < minimumDistinct || selected.length > group.maxSelection) {
          throw new PricingError("invalid_modifiers", `Invalid selection for ${group.name}`);
        }
        if (!Number.isInteger(total) || !total || total < 1 || total > 100 || selected.length > total) {
          throw new PricingError("invalid_modifiers", `Invalid equal split configuration for ${group.name}`);
        }
        selected = distributeEqually(selected, total);
      } else {
        const minimum = group.required ? Math.max(1, group.minSelection) : group.minSelection;
        const selectionCount = mode === "quantity_per_option"
          ? selected.reduce((sum, selection) => sum + selection.quantity, 0)
          : selected.length;
        if (mode === "distinct_choices" && selected.some((selection) => selection.quantity !== 1)) {
          throw new PricingError("invalid_modifiers", `Invalid quantity for ${group.name}`);
        }
        if (selectionCount < minimum || selectionCount > group.maxSelection) {
          throw new PricingError("invalid_modifiers", `Invalid selection for ${group.name}`);
        }
      }

      for (const { modifier, quantity: modifierQuantity } of selected) {
        snapshots.push({
          group_id: group.id,
          group_name: group.name,
          modifier_id: modifier.id,
          modifier_name: modifier.name,
          unit_price_cents: assertCents(modifier.priceCents),
          quantity: modifierQuantity,
        });
      }
    }

    const baseUnitPriceCents = assertCents(product.promotionalPriceCents ?? product.priceCents);
    const modifiersUnitPriceCents = assertCents(snapshots.reduce((sum, modifier) => {
      return assertCents(sum + assertCents(modifier.unit_price_cents * modifier.quantity));
    }, 0));
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
