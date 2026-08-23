import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SYSTEM_ROLE_CONTEXTS } from "@/components/layout/navigation-model";
import { MODULE_KEYS } from "@/modules/module-catalog";

const root = process.cwd();
const baselinePath = path.join(root, "docs/qa/PRESENTATION_READINESS_BASELINE_20260822.md");
const testDataPath = path.join(root, "docs/qa/PRESENTATION_TEST_DATA_20260822.md");
const baseline = fs.readFileSync(baselinePath, "utf8");
const testData = fs.readFileSync(testDataPath, "utf8");

function walk(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

function routeFor(file: string) {
  const relative = path.relative(path.join(root, "src/app"), file).replaceAll(path.sep, "/");
  const route = relative
    .replace(/\/(page|route)\.(ts|tsx)$/, "")
    .replace(/^(page|route)\.(ts|tsx)$/, "")
    .replace(/(^|\/)\([^/]+\)/g, "$1")
    .replace(/\/+$/, "");
  return `/${route}`.replace(/\/+/g, "/");
}

describe("presentation readiness inventory PA-DIAG-001..005", () => {
  it("keeps every current page and route handler in the checked-in inventory", () => {
    const appFiles = walk(path.join(root, "src/app"))
      .filter((file) => /\/(page\.tsx|route\.ts)$/.test(file));

    expect(appFiles).toHaveLength(91);
    for (const file of appFiles) {
      expect(baseline, `${routeFor(file)} from ${path.relative(root, file)} is missing`).toContain(
        `\`${routeFor(file)}\``,
      );
    }
  });

  it("documents every module and every system role context", () => {
    for (const moduleKey of MODULE_KEYS) expect(baseline).toContain(`\`${moduleKey}\``);
    for (const roleKey of Object.keys(SYSTEM_ROLE_CONTEXTS)) {
      expect(baseline).toContain(`\`${roleKey}\``);
    }
  });

  it("pins the canonical live services without storing their secrets", () => {
    expect(baseline).toContain("https://www.pedeaqui.pp.ua");
    expect(baseline).toContain("zsbsczjhiujnhdznrzck");
    expect(baseline).toContain("ACTIVE_HEALTHY");
    expect(`${baseline}\n${testData}`).not.toMatch(/(service_role|access_token|app_secret)\s*=\s*\S+/i);
    expect(`${baseline}\n${testData}`).not.toMatch(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/);
  });

  it("keeps presentation mutations constrained to the isolated demo tenant", () => {
    expect(testData).toContain("platform_demo = true");
    expect(testData).toContain("/m/santa-rita");
    expect(testData).toContain("PA-DIAG-111");
    expect(testData).toContain("não compartilhar a sessão de super admin");
  });
});
