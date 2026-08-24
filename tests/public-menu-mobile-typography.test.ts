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
    expect(publicBrandCss).toContain("font-size:1.125rem;font-weight:900");
    expect(menuBrowserCss).toContain(".productTitle{font-size:.9375rem");
    expect(menuBrowserCss).toContain(".description{font-size:.8125rem");
    expect(menuBrowserCss).toContain(".price{font-size:1rem}");
    expect(productCss).toContain(".productTitle{font-size:1.25rem");
    expect(modifierCss).toContain(".heading legend{font-size:1rem");
    expect(modifierCss).toContain(".optionName{display:grid;gap:2px;font-size:.875rem");
  });

  it("keeps categories available while the customer scrolls the catalog", () => {
    expect(menuBrowserCss).toContain(".categories{position:sticky;top:0;z-index:60");
    expect(menuBrowserCss).toContain(".categoryButton{min-height:38px");
    expect(menuBrowserCss).toContain("scroll-margin-top:62px");
  });

  it("makes product cards more purchase-oriented without losing performance contracts", () => {
    expect(menuBrowserCss).toContain("grid-template-columns:minmax(0,1fr) 108px");
    expect(menuBrowserCss).toContain(".image,.placeholder{width:108px;height:108px");
    expect(menuBrowserCss).toContain("border-color:transparent;border-radius:16px;box-shadow:var(--shadow-sm)");
    expect(productCard).toContain("Ver opções →");
    expect(productCard).toContain('width={104} height={104} loading="lazy" decoding="async"');
  });

  it("presents product configuration as a guided purchase flow while keeping server authority explicit", () => {
    expect(productPage).toContain("Monte do seu jeito");
    expect(productPage).toContain("Etapa {index + 1}");
    expect(productPage).toContain("Finalizar item");
    expect(productPage).toContain("Tudo certo?");
    expect(productPage).toContain("O PedeAqui recalcula produto e adicionais no servidor");
    expect(productCss).toContain(".stepBlock{display:grid;gap:7px;scroll-margin-top:64px}");
  });

  it("keeps touch targets physically large", () => {
    expect(modifierCss).toContain(".stepper button{min-width:42px;min-height:42px;font-size:24px}");
    expect(complements).toContain("width: 44, minHeight: 44");
    expect(complements).toContain("fontSize: 24");
  });
});
