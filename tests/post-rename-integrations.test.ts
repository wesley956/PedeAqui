import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

describe("post-rename technical integration guardrail", () => {
  it("uses the official technical package name", () => {
    const pkg = JSON.parse(read("package.json")) as { name?: string };
    expect(pkg.name).toBe("pedeaqui");
  });

  it("pins CI to the canonical repository context through the guard script", () => {
    const ci = read(".github/workflows/ci.yml");
    const guard = read("scripts/check-repository-name.mjs");
    expect(ci).toContain("node scripts/check-repository-name.mjs");
    expect(guard).toContain('const expected = "wesley956/PedeAqui"');
    expect(ci).not.toContain("wesley956/cruz");
    expect(guard).not.toContain("wesley956/cruz");
  });

  it("keeps Pages repository-name agnostic", () => {
    const pages = read(".github/workflows/deploy-pages.yml");
    expect(pages).toContain("steps.deployment.outputs.page_url");
    expect(pages).not.toContain("wesley956/cruz");
  });

  it("documents every known post-rename integration outcome", () => {
    const doc = read("docs/POST_RENAME_INTEGRATIONS_322.md");
    for (const marker of [
      "1329524264",
      "wesley956/PedeAqui",
      "pedeaqui",
      "zsbsczjhiujnhdznrzck",
      "Supabase display name",
      "Vercel",
      "GitHub Pages",
      "Rollback",
    ]) {
      expect(doc).toContain(marker);
    }
  });
});
