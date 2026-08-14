import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("mobile UX contracts", () => {
  it("keeps every primary module represented in the canonical navigation model", () => {
    const navigation = source("src/components/layout/navigation-model.ts");
    for (const href of ["/dashboard", "/pedidos", "/cardapio/produtos", "/pdv", "/producao", "/clientes", "/equipe", "/configuracoes"]) {
      expect(navigation).toContain(`href: "${href}"`);
    }
  });

  it("keeps mobile navigation short instead of horizontally scrolling every module", () => {
    const mobile = source("src/components/layout/mobile-navigation.tsx");
    const css = source("src/app/shell.css");
    expect(mobile).toContain("limit = 4");
    expect(mobile).toContain("Mais");
    expect(css).not.toContain("grid-auto-flow: column");
    expect(css).not.toContain("overflow-x: auto");
    expect(css).toContain("env(safe-area-inset-bottom)");
  });

  it("keeps PDV controls at touch-friendly height on small screens", () => {
    const css = source("src/features/pdv/pdv.module.css");
    expect(css).toContain("@media (max-width: 560px)");
    expect(css).toContain("min-height: 44px");
    expect(css).toContain(".twoColumns");
    expect(css).toContain("grid-template-columns: 1fr");
  });

  it("keeps public menu search and product layout responsive", () => {
    const menu = source("src/features/menu/menu-browser.tsx");
    expect(menu).toContain("minHeight: 48");
    expect(menu).toContain("overflowX: \"auto\"");
    expect(menu).toContain("minmax(min(100%, 300px), 1fr)");
  });
});
