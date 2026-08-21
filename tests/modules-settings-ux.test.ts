import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const page = fs.readFileSync(path.join(process.cwd(), "src/app/(app)/configuracoes/modulos/page.tsx"), "utf8");

describe("module settings UX", () => {
  it("uses direct activation language instead of review jargon", () => {
    expect(page).toContain('"Desativar"');
    expect(page).toContain('"Ativar"');
    expect(page).not.toContain("Revisar desativação");
    expect(page).not.toContain("Revisar ativação");
  });

  it("keeps confirmation next to the selected module", () => {
    expect(page).toContain("Confirmar desativação");
    expect(page).toContain("Confirmar ativação");
    expect(page).toContain("Nada será alterado até você confirmar");
    expect(page).toContain('href="/configuracoes/modulos">Cancelar</Link>');
  });
});
