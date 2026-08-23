import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const selector = readFileSync("src/features/menu/modifier-group-selector.tsx", "utf8");
const page = readFileSync("src/app/m/[slug]/produto/[id]/page.tsx", "utf8");
const adminPage = readFileSync("src/app/(app)/cardapio/adicionais/page.tsx", "utf8");

describe("public modifier selector", () => {
  it("keeps legacy min, max, required and checkbox/radio behavior", () => {
    expect(selector).toContain("group.min_selection");
    expect(selector).toContain("group.max_selection");
    expect(selector).toContain("Obrigatório");
    expect(selector).toContain("Opcional");
    expect(selector).toContain("current.length >= group.max_selection");
    expect(selector).toContain("maxReached");
    expect(selector).toContain('type={single ? "radio" : "checkbox"}');
  });

  it("renders quantity steppers with aggregate maximum and accessible controls", () => {
    expect(selector).toContain('group.selection_mode === "quantity_per_option"');
    expect(selector).toContain("modifier_qty_");
    expect(selector).toContain("unidade(s) selecionada(s) · máximo");
    expect(selector).toContain("Adicionar uma unidade de");
    expect(selector).toContain("Remover uma unidade de");
    expect(selector).toContain("currentTotal >= group.max_selection");
  });

  it("lets the restaurant explicitly configure the selection mode", () => {
    expect(adminPage).toContain('value="distinct_choices"');
    expect(adminPage).toContain('value="quantity_per_option"');
    expect(adminPage).toContain("O máximo é um teto");
  });

  it("keeps server-side add-to-cart as final authority", () => {
    expect(page).toContain("addToCartAction");
    expect(page).toContain("O PedeAqui recalcula produto e adicionais no servidor");
  });

  it("disables modifier groups when the product or store is unavailable", () => {
    expect(page).toContain("orderUnavailable = soldOut || !operational.canOrder");
    expect(page).toContain("disabled={orderUnavailable}");
  });
});
