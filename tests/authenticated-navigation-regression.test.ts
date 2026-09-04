import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("authenticated navigation regressions", () => {
  it("uses neutral grammar in the settings heading", () => {
    const page = read("src/app/(app)/configuracoes/page.tsx");
    expect(page).toContain("<h1>Configure seu negócio</h1>");
    expect(page).not.toContain("Configure sua {vocabulary.unitLabel}");
  });

  it("keeps one page-level heading in the catalog products route", () => {
    const layout = read("src/app/(app)/cardapio/layout.tsx");
    const page = read("src/app/(app)/cardapio/produtos/page.tsx");
    expect(layout).toContain("<h1>Organize o que você vende</h1>");
    expect(page).toContain("<h2>Produtos</h2>");
    expect(page).not.toContain("<h1>Produtos</h1>");
  });

  it("keeps dashboard copy neutral across restaurant, gas and generic profiles", () => {
    const page = read("src/app/(app)/dashboard/page.tsx");
    expect(page).toContain("O essencial para cuidar do seu negócio agora.");
    expect(page).toContain('settings: { title: "Configurar negócio"');
    expect(page).toContain('catalog: { title: "Editar catálogo"');
    expect(page).not.toContain("sua {vocabulary.unitLabel}");
    expect(page).not.toContain('title: "Configurar restaurante"');
  });
});
