import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const page = readFileSync("src/app/m/[slug]/page.tsx", "utf8");
const browser = readFileSync("src/features/menu/menu-browser.tsx", "utf8");
const browserStyles = readFileSync("src/features/menu/menu-browser.module.css", "utf8");
describe("public menu layout", () => {
  it("prioritizes restaurant status and fulfillment before browsing", () => { expect(page).toContain("RestaurantBrand"); expect(page).toContain("Opções do pedido"); expect(page).toContain("MenuBrowser"); });
  it("keeps search and categories explicit", () => { expect(browser).toContain("Buscar no cardápio"); expect(browser).toContain('aria-label="Categorias"'); });
  it("uses restaurant theme variables instead of hardcoded menu accent", () => { expect(page).toContain("restaurantBrandVars"); expect(browserStyles).toContain("var(--restaurant-primary)"); });
  it("keeps the approved menu structure and delegates cart access to the contextual bottom bar", () => { expect(page).toContain("<PublicCartBar"); expect(page).not.toContain('className={styles.cart}'); expect(browserStyles).toContain(".products{grid-template-columns:1fr}"); });
});
