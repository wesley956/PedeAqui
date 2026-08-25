import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderPrintDocument } from "@/server/printing/templates";

const migration = readFileSync("supabase/sql/134_modifier_quantity_selection.sql", "utf8");
const cartActions = readFileSync("src/features/cart/actions.ts", "utf8");
const modifierSelector = readFileSync("src/features/menu/modifier-group-selector.tsx", "utf8");

describe("modifier quantity persistence contract", () => {
  it("is append-only with legacy defaults", () => {
    expect(migration).toContain("selection_mode text not null default 'distinct_choices'");
    expect(migration).toContain("quantity integer not null default 1");
    expect(migration).toContain("quantity_per_option");
  });

  it("copies quantities from cart snapshots into order snapshots", () => {
    expect(migration).toContain("unit_price_cents,quantity");
    expect(migration).toContain("m.unit_price_cents,m.quantity");
  });

  it("keeps gas cart pricing quantity-aware", () => {
    expect(migration).toContain("cart_add_gas_item_internal");
    expect(migration).toContain("v_modifier_quantity");
    expect(migration).toContain("cart_item_gas_options");
  });

  it("keeps the quantity validation proxy out of submitted modifier ids", () => {
    expect(modifierSelector).not.toContain('name={`modifier_group_total_${group.id}`}');
    expect(cartActions).toContain("legacyModifierFieldPattern.test(key)");
    expect(cartActions).not.toContain('key.startsWith("modifier_") && !key.startsWith("modifier_qty_")');
  });

  it("prints flavor quantities without changing the product quantity", () => {
    const ticket = renderPrintDocument({
      order: {
        id: "order-1",
        display_number: 1054,
        channel: "digital_menu",
        fulfillment_type: "delivery",
        subtotal_cents: 1800,
        discount_cents: 0,
        delivery_fee_cents: 0,
        total_cents: 1800,
        created_at: "2026-08-23T10:00:00.000Z",
      },
      station: { id: "station-1", name: "Cozinha", code: "KDS", kind: "production" },
      items: [{
        name: "Copo com salgados",
        quantity: 1,
        modifiers: [
          { name: "Coxinha", quantity: 5, unit_price_cents: 0 },
          { name: "Kibe", quantity: 2, unit_price_cents: 0 },
        ],
      }],
    }, "kitchen", 80);

    expect(ticket).toContain("1x Copo com salgados");
    expect(ticket).toContain("+ 5x Coxinha");
    expect(ticket).toContain("+ 2x Kibe");
  });
});
