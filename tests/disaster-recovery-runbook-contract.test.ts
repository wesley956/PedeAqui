import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const runbook = fs.readFileSync(
  path.join(process.cwd(), "docs/DISASTER_RECOVERY_RUNBOOK.md"),
  "utf8",
);

describe("SAAS-04 disaster recovery runbook contract", () => {
  it("defines explicit provisional RPO/RTO targets without claiming certification", () => {
    expect(runbook).toContain("RPO alvo:** até 24 horas");
    expect(runbook).toContain("RTO alvo:** até 4 horas");
    expect(runbook).toContain("alvos provisórios, não certificados");
    expect(runbook).toContain("não deve declarar recovery/restore como certificado");
  });

  it("keeps database, auth, storage and secrets as separate recovery scopes", () => {
    expect(runbook).toContain("### 3.1 PostgreSQL / Supabase");
    expect(runbook).toContain("### 3.2 Supabase Auth");
    expect(runbook).toContain("### 3.3 Supabase Storage");
    expect(runbook).toContain("### 3.4 Configuração e segredos");
    expect(runbook).toContain("Backup do banco não equivale a backup de");
  });

  it("forbids certification and destructive production drills without provider evidence", () => {
    expect(runbook).toContain("Produção nunca é usada como ambiente de treinamento de restore");
    expect(runbook).toContain("restore destrutivo em produção");
    expect(runbook).toContain("evidência administrativa de backup/PITR: **PENDENTE**");
    expect(runbook).toContain("restore drill isolado: **PENDENTE**");
  });

  it("requires post-restore tenant integrity, storage and auth validation", () => {
    expect(runbook).toContain("### 9.1 Integridade de tenant");
    expect(runbook).toContain("Qualquer cross-tenant inconsistente é **FAIL**");
    expect(runbook).toContain("### 9.3 Storage");
    expect(runbook).toContain("### 9.4 Auth e secrets");
  });

  it("requires measured evidence for every drill", () => {
    expect(runbook).toContain("RPO alvo e observado");
    expect(runbook).toContain("RTO alvo e observado");
    expect(runbook).toContain("decisão final PASS/FAIL");
    expect(runbook).toContain("SHA/versão de código usada");
  });
});
