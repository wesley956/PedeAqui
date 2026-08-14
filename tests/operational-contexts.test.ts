import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const doc = fs.readFileSync(path.join(process.cwd(), "docs/OPERATIONAL_CONTEXTS.md"), "utf8");

const contexts = [
  "Proprietário / Gestor",
  "Gerente",
  "Caixa",
  "Atendimento / Balcão / Conversas",
  "Garçom / Salão",
  "Cozinha / Produção",
  "Entregador",
  "Administrativo",
] as const;

describe("restaurant operational contexts", () => {
  it("documents every context required by [270]", () => {
    for (const context of contexts) expect(doc).toContain(context);
  });

  it("covers the decision dimensions that drive contextual navigation", () => {
    for (const dimension of [
      "Tarefas frequentes",
      "Informação necessária",
      "Ações principais",
      "Módulos principais",
      "Módulos secundários",
      "Módulos raros",
      "Dispositivo provável",
      "Tela inicial ideal",
    ]) expect(doc).toContain(dimension);
  });

  it("keeps operational context explicitly separate from authorization", () => {
    expect(doc).toContain("não define autorização");
    expect(doc).toContain("Não altera RBAC");
    expect(doc).toContain("não transform");
  });

  it("defines concrete starting surfaces for specialist roles", () => {
    expect(doc).toContain("**Salão/Mesas**");
    expect(doc).toContain("**Produção/KDS**");
    expect(doc).toContain("**Meu roteiro**");
    expect(doc).toContain("**PDV**");
  });
});
