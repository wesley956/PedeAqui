import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("moldura do painel no celular (Fase B)", () => {
  it("hides the floating guide button on phones and opens the guide from the menus", () => {
    const css = read("src/app/mobile-shell.css");
    expect(css).toContain('.app-shell button[aria-label="Abrir assistente do PedeAqui"] { display: none; }');
    expect(read("src/features/user-guide/new-user-guide.tsx")).toContain("window.addEventListener(OPEN_GUIDE_EVENT, openFromMenu)");
    expect(read("src/components/layout/operation-topbar.tsx")).toContain("<OpenGuideButton");
    expect(read("src/components/layout/mobile-navigation.tsx")).toContain("Guia de primeiros passos");
  });

  it("opens the guide by itself only the first time", () => {
    expect(read("src/server/onboarding/user-guide-service.ts")).toContain('autoOpen: status === "not_started"');
  });

  it("shows Mais as a grouped sheet with icons that closes after choosing", () => {
    const nav = read("src/components/layout/mobile-navigation.tsx");
    expect(nav).toContain('title: "Gestão"');
    expect(nav).toContain('title: "Conta e ajustes"');
    expect(nav).toContain("mobile-more-icon");
    expect(nav).toContain("closeMore()");
    expect(read("src/app/mobile-shell.css")).toContain(".app-shell .mobile-more-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));");
  });

  it("gives the store name room in the top bar and hides the health dot when all is fine", () => {
    const css = read("src/app/mobile-shell.css");
    expect(css).toContain(".app-topbar-compact .app-item-search .app-movement-label { display: none; }");
    expect(css).toContain('.app-topbar-compact .operational-health[data-severity="healthy"]');
    expect(css).toContain(".app-topbar-compact .app-topbar-actions > details > summary { min-width: 44px; min-height: 44px; }");
  });

  it("keeps page tabs and the catalog menu on a single scrolling row", () => {
    expect(read("src/components/ui/page-tabs.module.css")).toContain(".tabs { flex-wrap: nowrap; overflow-x: auto;");
    expect(read("src/app/(app)/cardapio/catalog-management.module.css")).toContain(".nav { display: flex; overflow-x: auto;");
    expect(read("src/components/ui/page-tabs.tsx")).toContain("scrollActiveIntoView(navRef.current)");
    expect(read("src/app/(app)/cardapio/catalog-navigation.tsx")).toContain("scrollActiveIntoView(navRef.current)");
  });
});
