import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const exists = (relative: string) => fs.existsSync(path.join(root, relative));
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

const requiredEvidence = [
  "docs/BRAND_IDENTITY.md",
  "docs/DESIGN_TOKENS.md",
  "docs/STRUCTURAL_TOKENS.md",
  "docs/CONTEXTUAL_NAVIGATION.md",
  "docs/CHECKOUT_STATUS.md",
  "public/brand/pedeaqui-logo.svg",
  "public/brand/pedeaqui-logo-on-dark.svg",
  "public/brand/pedeaqui-symbol.svg",
  "supabase/production-migrations.json",
  "scripts/check-db-drift.mjs",
  "tests/e2e-context-journeys.test.ts",
  "tests/full-accessibility-qa.test.ts",
  "tests/frontend-performance-qa.test.ts",
] as const;

describe("final cycle review [319]", () => {
  it("keeps the canonical evidence required to close the cycle", () => {
    for (const file of requiredEvidence) expect(exists(file), file).toBe(true);
  });

  it("records approval and the explicit technical-name handoff", () => {
    const review = read("docs/CYCLE_REVIEW_319.md");
    expect(review).toContain("APROVADA PARA INICIAR O FECHAMENTO TÉCNICO [320]–[323]");
    expect(review).toContain("Leaked Password Protection");
    expect(review).toContain("nome técnico legado `cruz`");
  });

  it("keeps the complete CI gate including E2E", () => {
    const workflow = read(".github/workflows/ci.yml");
    expect(workflow).toContain("Check database migration history");
    expect(workflow).toContain("Lint");
    expect(workflow).toContain("Typecheck");
    expect(workflow).toContain("Test");
    expect(workflow).toContain("E2E context journeys");
    expect(workflow).toContain("Validate Print Agent");
    expect(workflow).toContain("Build");
  });
});
