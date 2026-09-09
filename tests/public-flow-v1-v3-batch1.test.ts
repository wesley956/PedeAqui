import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

const menuPage = read("src/app/m/[slug]/page.tsx");
const menuBrowser = read("src/features/menu/menu-browser.tsx");
const productPage = read("src/app/m/[slug]/produto/[id]/page.tsx");
const cartPage = read("src/app/m/[slug]/carrinho/page.tsx");
const cartActions = read("src/features/cart/actions.ts");
const cartBar = read("src/features/cart/public-cart-bar.tsx");
const menuCss = read("src/app/m/[slug]/public-menu.module.css");
const productCss = read("src/app/m/[slug]/produto/[id]/public-product.module.css");
const cartCss = read("src/app/m/[slug]/carrinho/cart.module.css");
const cartBarCss = read("src/features/cart/public-cart-bar.module.css");

describe("[987] public journey baseline", () => {
  it("keeps public menu operational and discovery contracts", () => {
    expect(menuPage).toContain("PublicMenuService.getMenu");
    expect(menuPage).toContain("menu.operational.canOrder");
    expect(menuPage).toContain("allow_delivery");
    expect(menuPage).toContain("allow_pickup");
    expect(menuBrowser).toContain("show_search");
    expect(menuBrowser).toContain("show_categories");
  });

  it("keeps product configuration and edit contracts", () => {
    expect(productPage).toContain("addToCartAction");
    expect(productPage).toContain("ModifierGroupSelector");
    expect(productPage).toContain("ComplementCategorySection");
    expect(productPage).toContain("gasSaleMode");
    expect(productPage).toContain("query.editar");
  });

  it("keeps cart server actions and invalid-item checkout gate", () => {
    expect(cartPage).toContain("updateCartQuantityAction");
    expect(cartPage).toContain("removeCartItemAction");
    expect(cartPage).toContain("invalidCount > 0");
    expect(cartPage).toContain(`/checkout`);
    expect(cartActions).toContain("CartItemEditService.replaceItem");
    expect(cartActions).toContain("CartService.updateQuantity");
    expect(cartActions).toContain("CartService.removeItem");
  });
});

describe("[988-991] V1+V3 visual continuity", () => {
  it("keeps official server summary for the persistent cart bar", () => {
    expect(cartBar).toContain("PublicCartSummaryService.get");
    expect(cartBar).toContain("/carrinho");
    expect(cartBar).toContain("return null");
    expect(cartBarCss).toContain("safe-area-inset-bottom");
    expect(cartBarCss).toContain("var(--brand-primary)");
  });

  it("uses official theme tokens rather than a parallel theme", () => {
    for (const css of [menuCss, productCss, cartCss, cartBarCss]) {
      expect(css).toContain("var(--surface-");
      expect(css).toContain("var(--text-");
      expect(css).toContain("var(--focus-ring)");
    }
  });

  it("protects narrow viewports and fixed bottom actions", () => {
    expect(productCss).toContain("@media(max-width:360px)");
    expect(cartCss).toContain("@media(max-width:360px)");
    expect(cartCss).toContain("safe-area-inset-bottom");
    expect(cartBarCss).toContain("safe-area-inset-left");
  });
});

describe("[992] route transition contracts", () => {
  it("keeps real route redirects and does not replace them with client cart state", () => {
    expect(cartActions).toContain("redirect(`/m/${result.store.slug}/carrinho`)");
    expect(cartActions).toContain("redirect(`/m/${values.storeSlug}/carrinho`)");
    expect(cartPage).toContain("href={`/m/${slug}/checkout`}");
    expect(productPage).toContain("href={editItemId ? `/m/${store.slug}/carrinho` : `/m/${store.slug}`}");
  });

  it("makes motion optional", () => {
    expect(menuCss).toContain("prefers-reduced-motion");
    expect(productCss).toContain("prefers-reduced-motion");
    expect(cartCss).toContain("prefers-reduced-motion");
    expect(cartBarCss).toContain("prefers-reduced-motion");
  });
});
