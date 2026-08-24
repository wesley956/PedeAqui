import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const publicMenuCss = readFileSync("src/app/m/[slug]/public-menu.module.css", "utf8");
const menuBrowserCss = readFileSync("src/features/menu/menu-browser.module.css", "utf8");
const modifierCss = readFileSync("src/features/menu/modifier-group-selector.module.css", "utf8");
const productCss = readFileSync("src/app/m/[slug]/produto/[id]/public-product.module.css", "utf8");
const productPage = readFileSync("src/app/m/[slug]/produto/[id]/page.tsx", "utf8");
const complements = readFileSync("src/features/menu/complement-category-section.tsx", "utf8");

describe("public menu mobile typography density", () => {
  it("reduces public browsing and product typography by exactly 20% on mobile", () => {
    expect(publicMenuCss).toContain("@media(max-width:640px){.root{font-size:80%}");
    expect(productCss).toContain("@media(max-width:640px){.root{font-size:80%}}");
    expect(menuBrowserCss).toContain("calc(var(--font-size-xl) * .8)");
    expect(menuBrowserCss).toContain("calc(var(--font-size-md) * .8)");
    expect(menuBrowserCss).toContain("calc(var(--font-size-sm) * .8)");
    expect(menuBrowserCss).toContain("calc(var(--font-size-xs) * .8)");
    expect(modifierCss).toContain("calc(var(--font-size-lg) * .8)");
    expect(productPage).toContain("className={styles.root}");
  });

  it("keeps touch targets and +/- controls physically large", () => {
    expect(modifierCss).toContain(".stepper button{min-width:42px;min-height:42px}");
    expect(modifierCss).toContain("font-size:24px");
    expect(complements).toContain("width: 44, minHeight: 44");
    expect(complements).toContain("fontSize: 24");
  });
});
