import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("casca do celular", () => {
  it("é carregada por último e define as medidas do celular num lugar só", () => {
    const layout = read("src/app/layout.tsx");
    const css = read("src/app/mobile-shell.css");
    expect(layout.indexOf('import "./mobile-shell.css"')).toBeGreaterThan(layout.indexOf('import "./compact-shell.css"'));
    expect(css).toContain("--mobile-nav-height: 68px;");
    expect(css).toContain("--app-topbar-height: 56px;");
    expect(css).toContain("font-size: var(--font-size-md);");
  });

  it("não deixa o botão do guia cobrir barras de ação", () => {
    expect(read("src/app/mobile-shell.css")).toContain(':has([data-sticky-actions], [data-hides-guide]) button[aria-label="Abrir assistente do PedeAqui"]');
    expect(read("src/app/(app)/configuracoes/loja/page.tsx")).toContain("data-sticky-actions");
    expect(read("src/features/pdv/pos-shell.tsx")).toContain("data-hides-guide");
  });

  it("recolhe a barra de pagamento do PDV no celular", () => {
    const shell = read("src/features/pdv/pos-shell.tsx");
    const css = read("src/features/pdv/pdv.module.css");
    expect(shell).toContain('aria-controls="pdv-checkout-details"');
    expect(css).toContain('.checkoutBar[data-expanded="false"] .checkoutPayment');
    expect(css).toContain("bottom:calc(var(--mobile-nav-height,68px) + env(safe-area-inset-bottom))");
  });

  it("evita zoom do iPhone na busca do cardápio público", () => {
    expect(read("src/features/menu/menu-browser.module.css")).toContain(".searchInput{min-height:44px;padding:0 12px;border-radius:var(--radius-lg);font-size:var(--font-size-md)}");
  });
});
