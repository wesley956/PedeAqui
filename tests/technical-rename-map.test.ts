import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("technical rename map [320]", () => {
  it("documents every required dependency class before the rename", () => {
    const map = read("docs/TECHNICAL_RENAME_MAP_320.md");
    for (const marker of [
      "GitHub repository",
      "Git remotes existentes",
      "`package.json`",
      "GitHub Actions",
      "GitHub Pages",
      "Vercel",
      "Supabase projeto oficial",
      "Codespaces/devcontainer",
      "hooks/deploy hooks",
      "issues/PRs/branches/tags",
      "Procedimento de rollback",
    ]) expect(map).toContain(marker);
    expect(map).toContain("zsbsczjhiujnhdznrzck");
    expect(map).toContain("wesley956/PedeAqui");
  });

  it("keeps the technical rename deferred until [321]/[322]", () => {
    const pkg = JSON.parse(read("package.json")) as { name: string };
    expect(pkg.name).toBe("cruz");
    expect(read("README.md")).toContain("# PedeAqui");
  });

  it("does not hardcode the old repository URL in central workflows", () => {
    for (const workflow of [".github/workflows/ci.yml", ".github/workflows/deploy-pages.yml"]) {
      expect(read(workflow)).not.toContain("wesley956/cruz");
    }
  });
});
