import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("platform operational settings navigation", () => {
  it("keeps a direct configure-operation shortcut for every unit", () => {
    const search = read("src/app/platform/organization-search.tsx");
    expect(search).toContain("Configurar operação →");
    expect(search).toContain("/configuracao-operacional");
  });

  it("renders a dedicated audited operational configuration page", () => {
    const page = read("src/app/platform/unidades/[storeId]/configuracao-operacional/page.tsx");
    const form = read("src/features/platform/operational-settings-form.tsx");
    expect(page).toContain("CONFIGURAÇÃO OPERACIONAL");
    expect(page).toContain("Esta tela não contrata nem ativa módulos novos");
    expect(page).toContain("OperationalSettingsService.loadPlatform");
    expect(form).toContain("Simplificado — 3 etapas: Iniciar, Pronto e Finalizados");
    expect(form).toContain("Rastreamento indisponível enquanto o módulo Entregador estiver desligado");
    expect(form).toContain("Campanhas indisponíveis enquanto o módulo Growth ou alguma dependência estiver desligada");
  });
});
