import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const manifest = JSON.parse(fs.readFileSync(path.join(root, "supabase/retired-edge-functions.json"), "utf8")) as {
  observedInvocationLogs: number;
  retirementResponse: { status: number; bodyError: string; verifyJwt: boolean };
  functions: string[];
};
const expected = [
  "create-employee",
  "create-company",
  "update-company-status",
  "sync-offline-event",
  "scan-absences",
  "send-alert",
  "validate-handover-employee",
  "update-employee-field-access",
  "mobile-history-feed",
  "review-presence-status",
  "reset-user-password",
];

function collectText(relative: string): string {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute)) return "";
  const stat = fs.statSync(absolute);
  if (stat.isFile()) return /\.(?:ts|tsx|js|mjs|json|css|sql)$/.test(relative) ? fs.readFileSync(absolute, "utf8") : "";
  return fs.readdirSync(absolute).map((entry) => collectText(path.join(relative, entry))).join("\n");
}

describe("retired Supabase Edge Functions", () => {
  it("records exactly the verified legacy function set and tombstone contract", () => {
    expect([...manifest.functions].sort()).toEqual([...expected].sort());
    expect(manifest.retirementResponse).toEqual({ status: 410, bodyError: "legacy_function_retired", verifyJwt: true });
    expect(manifest.observedInvocationLogs).toBe(0);
  });

  it("does not reuse retired slugs in PedeAqui application or Print Agent code", () => {
    const source = `${collectText("src")}\n${collectText("print-agent")}`;
    for (const slug of expected) expect(source, `${slug} must remain retired`).not.toContain(slug);
  });

  it("does not carry legacy Edge Function sources in the current repository", () => {
    expect(fs.existsSync(path.join(root, "supabase/functions"))).toBe(false);
  });

  it("documents an evidence-based retirement instead of deletion by name", () => {
    const doc = fs.readFileSync(path.join(root, "docs/technical/LEGACY_REVIEW_309.md"), "utf8");
    expect(doc).toContain("Nenhuma função foi julgada apenas pelo nome");
    expect(doc).toContain("0 invocações nas últimas 24 horas");
    expect(doc).toContain("manter os tombstones aposentados");
  });
});
