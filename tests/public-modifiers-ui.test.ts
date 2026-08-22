import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const selector = readFileSync("src/features/menu/modifier-group-selector.tsx", "utf8");
const page = readFileSync("src/app/m/[slug]/produto/[id]/page.tsx", "utf8");
describe("public modifier selector", () => {
  it("shows min, max and required state", () => { expect(selector).toContain("group.min_selection"); expect(selector).toContain("group.max_selection"); expect(selector).toContain("Obrigatório"); expect(selector).toContain("Opcional"); });
  it("prevents selecting beyond the configured maximum", () => { expect(selector).toContain("current.length >= group.max_selection"); expect(selector).toContain("maxReached"); });
  it("keeps server-side add-to-cart as final authority", () => { expect(page).toContain("addToCartAction"); expect(page).toContain("O PedeAqui recalcula produto e adicionais no servidor"); });
  it("disables modifier groups when the product or store is unavailable", () => { expect(page).toContain("orderUnavailable = soldOut || !operational.canOrder"); expect(page).toContain("disabled={orderUnavailable}"); });
});
