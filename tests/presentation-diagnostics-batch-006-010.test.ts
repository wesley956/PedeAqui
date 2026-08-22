import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeAppUrl } from "@/lib/app-url";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("presentation diagnostics PA-DIAG-006 to PA-DIAG-010", () => {
  it("normalizes external auth and invitation callback origins", () => {
    expect(normalizeAppUrl(" https://www.pedeaqui.pp.ua/// ", "http://localhost:3000")).toBe("https://www.pedeaqui.pp.ua");
    expect(normalizeAppUrl(undefined, "http://localhost:3000/")).toBe("http://localhost:3000");

    const auth = read("src/features/auth/actions.ts");
    const commercial = read("src/server/platform/platform-commercial-onboarding-service.ts");
    expect(auth).toContain("normalizeAppUrl(process.env.APP_URL");
    expect(commercial).toContain('normalizeAppUrl(process.env.APP_URL, "https://www.pedeaqui.pp.ua")');
  });

  it("records every issue in the batch without claiming blocked external flows passed", () => {
    const doc = read("docs/qa/PRESENTATION_DIAGNOSTICS_006_010_20260822.md");
    for (const id of ["PA-DIAG-006", "PA-DIAG-007", "PA-DIAG-008", "PA-DIAG-009", "PA-DIAG-010"]) {
      expect(doc).toContain(id);
    }
    expect(doc).toContain("Parcial");
    expect(doc).toContain("ROLLBACK");
    expect(doc).toContain("zero organizações");
    expect(doc).toContain("conta Vercel conectada retorna zero projetos");
    expect(doc).toContain("Não criar ou compartilhar senha de super admin");
  });

  it("defines a release and rollback gate before later functional batches", () => {
    const gate = read("docs/qa/PRESENTATION_RELEASE_GATE_20260822.md");
    for (const state of ["confirmado", "corrigido-local", "retestado", "publicado", "revertido", "bloqueado"]) {
      expect(gate).toContain(`\`${state}\``);
    }
    expect(gate).toContain("CI verde");
    expect(gate).toContain("BEGIN ... ROLLBACK");
    expect(gate).toContain("Não há migration nem alteração persistente de dados");
  });
});
