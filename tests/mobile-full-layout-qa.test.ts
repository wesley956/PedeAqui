import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8").replace(/\s+/g, " ");

describe("full mobile layout QA [314]", () => {
  it("keeps one mobile navigation with More and no desktop sidebar", () => {
    const shell = read("src/app/shell.css");
    const mobile = read("src/components/layout/mobile-navigation.tsx");
    expect(shell).toContain("@media (max-width: 900px)");
    expect(shell).toContain(".app-sidebar { display: none; }");
    expect(shell).toContain(".mobile-nav { position: fixed;");
    expect(mobile).toContain("limit = 4");
    expect(mobile).toContain("<details className=\"mobile-more\">");
    expect(mobile).toContain("Mais");
  });

  it("reserves safe-area and keyboard focus space without global horizontal scrolling", () => {
    const shell = read("src/app/shell.css");
    const mobileCss = read("src/app/mobile.css");
    expect(shell).toContain("env(safe-area-inset-bottom)");
    expect(mobileCss).toContain("overflow-x: clip");
    expect(mobileCss).toContain("scroll-margin-block");
    expect(mobileCss).toContain("calc(96px + env(safe-area-inset-bottom))");
    expect(mobileCss).toContain("overscroll-behavior: contain");
    expect(mobileCss).toContain("touch-action: manipulation");
  });

  it("keeps public menu and checkout responsive independently from the authenticated shell", () => {
    const menu = read("src/features/menu/menu-browser.module.css");
    const checkout = read("src/app/m/[slug]/checkout/checkout.module.css");
    expect(menu).toContain("@media(max-width:640px)");
    expect(menu).toContain(".products{grid-template-columns:1fr}");
    expect(menu).toContain("overflow-x:auto");
    expect(checkout).toContain("@media(max-width:720px)");
    expect(checkout).toContain("@media(max-width:480px)");
    expect(checkout).toContain("grid-template-columns:1fr");
  });

  it("keeps dining readable down to narrow phones", () => {
    const dining = read("src/features/dining/dining.module.css");
    expect(dining).toContain("@media(max-width:620px)");
    expect(dining).toContain(".tableGrid{grid-template-columns:repeat(2,minmax(0,1fr))}");
    expect(dining).toContain("@media(max-width:430px){.tableGrid{grid-template-columns:1fr}");
  });

  it("keeps courier actions large and mobile-specific", () => {
    const courier = read("src/features/delivery/courier.module.css");
    expect(courier).toContain("min-height:60px");
    expect(courier).toContain("@media(max-width:520px)");
    expect(courier).toContain("@media(pointer:coarse)");
  });

  it("loads mobile overrides globally after shell rules", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout.indexOf('import "./mobile.css"')).toBeGreaterThan(layout.indexOf('import "./shell.css"'));
  });
});
