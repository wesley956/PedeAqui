import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const client = fs.readFileSync(path.join(process.cwd(), "src/app/(app)/configuracoes/modulos/resources-client.tsx"), "utf8");
const actions = fs.readFileSync(path.join(process.cwd(), "src/features/modules/actions.ts"), "utf8");

describe("module settings UX", () => {
  it("uses direct activation language instead of review jargon", () => {
    expect(client).toContain('resource.enabled ? "Desativar" : "Ativar"');
    expect(client).not.toContain("Revisar desativação");
    expect(client).not.toContain("Revisar ativação");
  });

  it("keeps confirmation inline next to the selected module", () => {
    expect(client).toContain('state.status === "confirm" ? "Confirmar"');
    expect(client).toContain("Toque em Confirmar para aplicar. Você permanece nesta mesma posição da página.");
    expect(client).toContain("applyModuleChangeInlineAction");
    expect(actions).toContain("O histórico continuará salvo.");
  });
});
