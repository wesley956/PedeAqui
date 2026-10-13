import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ModifierGroupSelector } from "@/features/menu/modifier-group-selector";
import { publicModifierGroupSchema } from "@/server/menu/schemas";
const option = "22222222-2222-4222-8222-222222222222";
function render(quantity: number, minimum = 25) {
  const group = publicModifierGroupSchema.parse({ id: "11111111-1111-4111-8111-111111111111", name: "Salgados", description: null, required: true, min_selection: minimum, max_selection: 25, selection_mode: "quantity_per_option", modifiers: [{ id: option, name: "Coxinha", price_cents: 150 }] });
  return renderToStaticMarkup(createElement(ModifierGroupSelector, { group, initialSelections: { [option]: quantity }, complementTargetId: "grupo-next", nextGroupName: "Pastéis" }));
}
describe("quantity journey after product redesign", () => {
  it("shows the remaining exact quantity and offers no continuation while incomplete", () => {
    const html = render(5); expect(html).toContain("5/25 escolhidos · faltam 20");expect(html).not.toContain("Continuar: Pastéis");expect(html).toContain('data-priced-quantity="5"');
  });
  it("offers the next group only once exact quantity is complete, retaining charged quantity", () => {
    const html = render(25);expect(html).toContain("25/25 escolhidos · completo");expect(html).toContain("Continuar: Pastéis →");expect(html).toContain('data-priced-quantity="25"');
  });
  it("retains the minimum threshold for flexible groups", () => {
    expect(render(5, 5)).toContain("Continuar: Pastéis →");expect(render(4, 5)).not.toContain("Continuar: Pastéis");
  });
});
