import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

const baseline = read("docs/PUBLIC_FLOW_V1_V3_BASELINE.md");
const browserHomologation = read("scripts/browser-homologation.mjs");
const menuPage = read("src/app/m/[slug]/page.tsx");
const menuBrowser = read("src/features/menu/menu-browser.tsx");
const productCard = read("src/features/menu/public-product-card.tsx");
const menuCss = read("src/features/menu/menu-browser.module.css");
const productPage = read("src/app/m/[slug]/produto/[id]/page.tsx");
const productCss = read("src/app/m/[slug]/produto/[id]/public-product.module.css");
const cartPage = read("src/app/m/[slug]/carrinho/page.tsx");
const cartCss = read("src/app/m/[slug]/carrinho/cart.module.css");
const cartBar = read("src/features/cart/public-cart-bar.tsx");
const cartBarCss = read("src/features/cart/public-cart-bar.module.css");
const checkoutPage = read("src/app/m/[slug]/checkout/page.tsx");
const workflow = read(".github/workflows/ci.yml");

describe("PUBLIC FLOW V1+V3 final gate #993/#994", () => {
  it("keeps the complete public journey and its server-side authorities documented", () => {
    expect(baseline).toContain("/m/[slug]` → `/m/[slug]/produto/[id]` → `/m/[slug]/carrinho` → `/m/[slug]/checkout");
    expect(baseline).toContain("PublicMenuService.getMenu");
    expect(baseline).toContain("CartService.getCart");
    expect(baseline).toContain("CartItemEditService.replaceItem");
    expect(baseline).toContain("server actions");
    expect(baseline).toContain("preço, disponibilidade, modificadores e totais permanecem server-side");
  });

  it("keeps menu exploration, product configuration and cart entry linked by real routes", () => {
    expect(menuPage).toContain("MenuBrowser");
    expect(menuPage).toContain("PublicCartBar");
    expect(menuBrowser).toContain("PublicProductCard");
    expect(productCard).toContain("/produto/${product.id}");
    expect(productPage).toContain("addToCartAction");
    expect(productPage).toContain("ModifierGroupSelector");
    expect(productPage).toContain("ComplementCategorySection");
    expect(productPage).toContain("PublicCartBar");
    expect(cartBar).toContain("/carrinho");
  });

  it("preserves product edit, unavailable, modifier and gas variants", () => {
    expect(productPage).toContain("query.editar");
    expect(productPage).toContain("cart_edit_failed");
    expect(productPage).toContain("product_unavailable");
    expect(productPage).toContain("invalid_modifiers");
    expect(productPage).toContain('"exchange"');
    expect(productPage).toContain('"with_container"');
    expect(productPage).toContain("soldOut");
  });

  it("keeps cart validation and the checkout boundary authoritative", () => {
    expect(cartPage).toContain("CartService.getCart");
    expect(cartPage).toContain("price_changed");
    expect(cartPage).toContain("unavailable");
    expect(cartPage).toContain("invalid_modifiers");
    expect(cartPage).toContain("/checkout");
    expect(checkoutPage).toContain("CheckoutService.load");
    expect(checkoutPage).toContain("Confirmar pedido ·");
  });

  it("protects mobile, safe-area, focus and reduced-motion contracts across the public surfaces", () => {
    for (const css of [menuCss, productCss, cartCss, cartBarCss]) {
      expect(css).toContain("focus-visible");
    }
    expect(menuCss).toContain("overflow-x:auto");
    expect(productCss).toContain("overflow-x:hidden");
    expect(cartCss).toContain("overflow-x:hidden");
    expect(productCss).toContain("env(safe-area-inset-bottom)");
    expect(cartCss).toContain("env(safe-area-inset-bottom)");
    expect(cartBarCss).toContain("env(safe-area-inset-bottom)");
    expect(menuCss).toContain("prefers-reduced-motion:reduce");
    expect(productCss).toContain("prefers-reduced-motion:reduce");
    expect(cartCss).toContain("prefers-reduced-motion:reduce");
  });

  it("enforces the required responsive/browser/accessibility homologation matrix", () => {
    for (const width of [320, 360, 390, 430, 768, 1024, 1366, 1440, 1920]) {
      expect(browserHomologation).toContain(String(width));
    }
    expect(browserHomologation).toContain("844, 390");
    expect(browserHomologation).toContain("1024, 768");
    expect(browserHomologation).toContain("scrollWidth");
    expect(browserHomologation).toContain("overflow horizontal");
    expect(browserHomologation).toContain("AxeBuilder");
    expect(browserHomologation).toContain("criticalImpact");
    expect(browserHomologation).toContain('devices["Pixel 7"]');
    expect(browserHomologation).toContain('devices["iPhone 14"]');
    expect(browserHomologation).toContain("webkit");
    expect(browserHomologation).toContain('page.keyboard.press("Tab")');
  });

  it("keeps the 200% zoom requirement covered by reflow down to the 320px contract", () => {
    expect(browserHomologation).toContain("320");
    expect(productCss).toContain("@media(max-width:360px)");
    expect(cartCss).toContain("@media(max-width:360px)");
    expect(menuCss).toContain("@media(max-width:640px)");
  });

  it("keeps the final CI gate running public UX, repeated E2E and production build", () => {
    expect(workflow).toContain("Public UX final homologation contracts");
    expect(workflow).toContain("E2E context journeys — 3 consecutive passes");
    expect(workflow).toContain("for attempt in 1 2 3");
    expect(workflow).toContain("npm run test:e2e");
    expect(workflow).toContain("npm run build");
  });
});
