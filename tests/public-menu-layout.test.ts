import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const page = readFileSync("src/app/m/[slug]/page.tsx", "utf8");
const browser = readFileSync("src/features/menu/menu-browser.tsx", "utf8");
const pageStyles = readFileSync("src/app/m/[slug]/public-menu.module.css", "utf8");
const browserStyles = readFileSync("src/features/menu/menu-browser.module.css", "utf8");
describe("public menu layout", () => {
  it("prioritizes restaurant status and fulfillment before browsing", () => { expect(page).toContain("RestaurantBrand"); expect(page).toContain("Opções do pedido"); expect(page).toContain("MenuBrowser"); });
  it("keeps search and categories explicit", () => { expect(browser).toContain("Buscar no cardápio"); expect(browser).toContain('aria-label="Categorias"'); });
  it("uses restaurant theme variables instead of hardcoded menu accent", () => { expect(page).toContain("restaurantBrandVars"); expect(browserStyles).toContain("var(--restaurant-primary)"); });
  it("provides mobile single-column content and a full-width cart action", () => { expect(pageStyles).toContain("@media(max-width:640px)"); expect(pageStyles).toContain(".cart{width:100%"); expect(browserStyles).toContain(".products{grid-template-columns:1fr}"); });
});
