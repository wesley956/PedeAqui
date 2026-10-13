import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("cabeçalho de página único", () => {
  it("define um título de 24 px para todas as telas do painel", () => {
    expect(read("src/app/shell.css")).toContain(".app-shell .app-content h1 {\n  font-size: var(--font-size-page-title);");
    expect(read("src/components/ui/page-header.module.css")).toContain("font-size: var(--font-size-page-title);");
  });

  it("usa o componente nas configurações refeitas", () => {
    for (const page of ["loja", "horarios", "entrega", "cardapio", "pagamentos", "fluxo-pedidos", "conversas"]) {
      const source = read(`src/app/(app)/configuracoes/${page}/page.tsx`);
      expect(source).toContain("<PageHeader title=");
      expect(source).not.toContain('<h1 style={{ margin: "4px 0" }}>');
    }
  });

  it("não mostra selo acima do título", () => {
    for (const page of ["dashboard/page.tsx", "estoque/page.tsx", "financeiro/page.tsx", "equipe/page.tsx", "caixa/page.tsx"]) {
      const source = read(`src/app/(app)/${page}`);
      expect(source).not.toMatch(/<p[^>]*>[^<{]{2,60}<\/p>\s*<h1/);
    }
  });
});
