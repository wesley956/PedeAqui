import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");
const json = <T>(relative: string) => JSON.parse(read(relative)) as T;

type SecurityBaseline = {
  projectRef: string;
  database: {
    publicTables: number;
    rlsEnabled: number;
    rlsDisabled: number;
    anonTableGrants: number;
    serviceRoleBypassRls: boolean;
  };
  authenticatedWithoutJwt: {
    organizationsVisible: number;
    storesVisible: number;
    ordersVisible: number;
    customersVisible: number;
  };
  migrations: { count: number; tailVersion: string; tailName: string };
  integrity: {
    orphanOrderItems: number;
    orphanCartItems: number;
    orphanOrderItemModifiers: number;
    orphanCartItemModifiers: number;
    e2eFixtureResidue: number;
  };
  advisor: { critical: number; knownInfoRlsEnabledNoPolicy: number; knownWarnings: string[] };
};

type MigrationBaseline = { projectRef: string; migrations: [string, string][] };

describe("final database and security homologation [318]", () => {
  const baseline = json<SecurityBaseline>("supabase/security-qa-baseline.json");
  const migrations = json<MigrationBaseline>("supabase/production-migrations.json");

  it("records every public table with RLS and no anon table grant", () => {
    expect(baseline.database.publicTables).toBe(113);
    expect(baseline.database.rlsEnabled).toBe(baseline.database.publicTables);
    expect(baseline.database.rlsDisabled).toBe(0);
    expect(baseline.database.anonTableGrants).toBe(0);
    expect(baseline.database.serviceRoleBypassRls).toBe(true);
  });

  it("records zero tenant visibility for authenticated role without JWT", () => {
    expect(Object.values(baseline.authenticatedWithoutJwt)).toEqual([0, 0, 0, 0]);
  });

  it("keeps the production migration baseline reconciled with the recorded live tail", () => {
    expect(migrations.projectRef).toBe(baseline.projectRef);
    expect(migrations.migrations).toHaveLength(baseline.migrations.count);
    expect(migrations.migrations.at(-1)).toEqual([baseline.migrations.tailVersion, baseline.migrations.tailName]);
    expect(fs.existsSync(path.join(root, "supabase/sql/90_onboarding_role_permission_conflict_hotfix.sql"))).toBe(true);
  });

  it("records zero controlled E2E residue and zero critical relationship orphans", () => {
    expect(baseline.integrity).toEqual({
      orphanOrderItems: 0,
      orphanCartItems: 0,
      orphanOrderItemModifiers: 0,
      orphanCartItemModifiers: 0,
      e2eFixtureResidue: 0,
    });
    const e2e = read("tests/e2e-context-journeys.test.ts");
    expect(e2e).toContain("00000000-0000-4000-8000-000000000001");
    expect(e2e).toContain("00000000-0000-4000-8000-000000000002");
  });

  it("keeps known advisor notices explicit instead of presenting them as resolved", () => {
    expect(baseline.advisor.critical).toBe(0);
    expect(baseline.advisor.knownInfoRlsEnabledNoPolicy).toBe(20);
    expect(baseline.advisor.knownWarnings).toEqual(["auth_leaked_password_protection"]);
    const doc = read("docs/qa/DATABASE_SECURITY_QA_318.md");
    expect(doc).toContain("20 avisos informativos conhecidos");
    expect(doc).toContain("auth_leaked_password_protection");
    expect(doc).toContain("não foi mascarado");
  });

  it("keeps drift, access, auth, integration and retired-legacy guardrails versioned", () => {
    for (const relative of [
      "scripts/check-db-drift.mjs",
      "tests/db-drift.test.ts",
      "tests/access-isolation-contracts.test.ts",
      "src/lib/auth/safe-return-path.ts",
      "docs/integrations/INTEGRATION_INVENTORY_308.md",
      "supabase/retired-edge-functions.json",
    ]) expect(fs.existsSync(path.join(root, relative)), `${relative} must remain versioned`).toBe(true);
  });

  it("keeps CI reproducible with drift, E2E, Print Agent and build gates", () => {
    const ci = read(".github/workflows/ci.yml");
    expect(ci).toContain("npm run db:drift");
    expect(ci).toContain("npm run test:e2e");
    expect(ci).toContain("Validate Print Agent");
    expect(ci).toContain("npm run build");
    expect(ci).not.toContain("supabase db push");
    expect(ci).not.toContain("supabase migration up");
  });
});
