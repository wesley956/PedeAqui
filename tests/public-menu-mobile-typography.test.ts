import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const publicMenuCss = readFileSync("src/app/m/[slug]/public-menu.module.css", "utf8");
const publicBrandCss = readFileSync("src/features/menu/public-brand.module.css", "utf8");
const menuBrowserCss = readFileSync("src/features/menu/menu-browser.module.css", "utf8");
const modifierCss = readFileSync("src/features/menu/modifier-group-selector.module.css", "utf8");
const productCss = readFileSync("src/app/m/[slug]/produto/[id]/public-product.module.css", "utf8");
const productPage = readFileSync("src/app/m/[slug]/produto/[id]/page.tsx", "utf8");
const productCard = readFileSync("src/features/menu/public-product-card.tsx", "utf8");
const complements = readFileSync("src/features/menu/complement-category-section.tsx", "utf8");

describe("public menu mobile visual hierarchy", () => {
  it("uses intentional readable sizes instead of uniformly shrinking the whole journey", () => {
    expect(publicMenuCss).not.toContain("font-size:80%");
    expect(productCss).not.toContain("font-size:80%");
    expect(publicMenuCss).not.toContain("--font-size-xs:calc(.75rem * .8)");
    expect(productCss).not.toContain("--font-size-xs:calc(.75rem * .8)");
    expect(publicBrandCss).toContain(".name{font-size:var(--font-size-lg);font-weight:var(--font-weight-bold)");
    expect(menuBrowserCss).toContain(".productTitle{font-size:var(--font-size-md)");
    expect(menuBrowserCss).toContain(".description{font-size:var(--font-size-support)");
    expect(menuBrowserCss).toContain(".price{font-size:var(--font-size-md)}");
    expect(productCss).toContain(".productTitle{font-size:var(--font-size-lg)");
    expect(modifierCss).toContain(".heading legend{font-size:var(--font-size-md)");
    expect(modifierCss).toContain(".optionName{display:grid;gap:2px;font-size:var(--font-size-sm)");
  });

  it("keeps categories available while the customer scrolls the catalog", () => {
    expect(menuBrowserCss).toContain(".categories{position:sticky;top:0;z-index:60");
    expect(menuBrowserCss).toContain(".categoryButton{min-height:38px");
    expect(menuBrowserCss).toContain("scroll-margin-top:62px");
  });

  it("uses a compact purchase row with a direct action and lazy images", () => {
    expect(menuBrowserCss).toContain(".product{display:grid;grid-template-columns:auto minmax(0,1fr) auto");
    expect(menuBrowserCss).toContain(".image,.imageFallback{width:72px;height:72px}");
    expect(menuBrowserCss).toContain(".addButton{width:44px;height:44px");
    expect(productCard).toContain('width={88} height={88} loading="lazy" decoding="async"');
  });

  it("shows the live item total in a fixed bar while keeping server authority explicit", () => {
    const purchaseBar = readFileSync("src/features/menu/product-purchase-bar.tsx", "utf8");
    expect(productPage).toContain("<ProductPurchaseBar");
    expect(productPage).toContain("Alguma observação?");
    expect(productPage).not.toContain("Etapa {index + 1}");
    expect(purchaseBar).toContain("o servidor recalcula o preço ao adicionar ao carrinho");
    expect(purchaseBar).toContain("(basePriceCents + modifiersCents) * quantity");
    expect(productCss).toContain(".stepBlock{display:grid;gap:7px;scroll-margin-top:64px}");
  });

  it("keeps touch targets physically large", () => {
    expect(modifierCss).toContain(".stepper button{min-width:42px;min-height:42px;font-size:var(--font-size-2xl)}");
    expect(complements).toContain("width: 44, minHeight: 44");
    expect(complements).toContain('fontSize: "var(--font-size-2xl)"');
  });
});
