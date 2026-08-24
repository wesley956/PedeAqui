import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const publicMenuCss = readFileSync("src/app/m/[slug]/public-menu.module.css", "utf8");
const menuBrowserCss = readFileSync("src/features/menu/menu-browser.module.css", "utf8");
const modifierCss = readFileSync("src/features/menu/modifier-group-selector.module.css", "utf8");
const productCss = readFileSync("src/app/m/[slug]/produto/[id]/public-product.module.css", "utf8");
const productPage = readFileSync("src/app/m/[slug]/produto/[id]/page.tsx", "utf8");
const complements = readFileSync("src/features/menu/complement-category-section.tsx", "utf8");
const cartBarCss = readFileSync("src/features/cart/public-cart-bar.module.css", "utf8");

const scaledTokens = [
  "--font-size-xs:calc(.75rem * .8)",
  "--font-size-sm:calc(.875rem * .8)",
  "--font-size-md:calc(1rem * .8)",
  "--font-size-lg:calc(1.125rem * .8)",
  "--font-size-xl:calc(1.25rem * .8)",
  "--font-size-2xl:calc(1.5rem * .8)",
  "--font-size-3xl:calc(2rem * .8)",
  "--font-size-display:calc(2.5rem * .8)",
];

describe("public menu mobile typography density", () => {
  it("scales inherited text and rem typography tokens by exactly 20% on mobile", () => {
    expect(publicMenuCss).toContain("@media(max-width:640px){.root{font-size:80%");
    expect(productCss).toContain("@media(max-width:640px){.root{font-size:80%");
    for (const token of scaledTokens) {
      expect(publicMenuCss).toContain(token);
      expect(productCss).toContain(token);
    }
    expect(menuBrowserCss).not.toContain("calc(var(--font-size");
    expect(modifierCss).not.toContain("calc(var(--font-size");
    expect(productPage).toContain("className={styles.root}");
  });

  it("lets the fixed public cart bar inherit the page scale without shrinking its touch target", () => {
    expect(cartBarCss).toContain(".items{font-size:.8125em");
    expect(cartBarCss).toContain(".total{font-size:1.0625em");
    expect(cartBarCss).toContain(".action{min-height:40px");
    expect(cartBarCss).toContain("font-size:.8125em");
  });

  it("keeps touch targets and +/- controls physically large", () => {
    expect(modifierCss).toContain(".stepper button{min-width:42px;min-height:42px}");
    expect(modifierCss).toContain("font-size:24px");
    expect(complements).toContain("width: 44, minHeight: 44");
    expect(complements).toContain("fontSize: 24");
  });
});
