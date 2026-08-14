import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relative: string) => readFileSync(join(root, relative), "utf8");

describe("final PedeAqui baseline [323]", () => {
  it("records the canonical technical identity and complete cycle", () => {
    const index = read("docs/PROJECT_INDEX.md");
    for (const marker of [
      "wesley956/PedeAqui",
      "Package técnico: **`pedeaqui`**",
      "[254]–[323]",
      "#284`–`#353",
      "89",
      "113/113",
      "zsbsczjhiujnhdznrzck",
      "https://wesley956.github.io/PedeAqui/",
    ]) {
      expect(index).toContain(marker);
    }
    expect(index).not.toContain("O repositório técnico continua se chamando `cruz`");
  });

  it("keeps the resume documents present", () => {
    for (const relative of [
      "docs/PROJECT_INDEX.md",
      "docs/ARCHITECTURE_DECISIONS.md",
      "docs/BRAND_IDENTITY.md",
      "docs/CYCLE_REVIEW_319.md",
      "docs/TECHNICAL_RENAME_MAP_320.md",
      "docs/POST_RENAME_INTEGRATIONS_322.md",
      "docs/FINAL_BASELINE_323.md",
    ]) {
      expect(existsSync(join(root, relative)), `${relative} should exist`).toBe(true);
    }
  });

  it("keeps README links resolvable and aligned to the canonical baseline", () => {
    const readme = read("README.md");
    expect(readme).toContain("Ciclo consolidado: **[001]–[323]**");
    expect(readme).toContain("wesley956/PedeAqui");
    expect(readme).not.toContain("wesley956/cruz");

    const links = [...readme.matchAll(/\]\((docs\/[^)]+)\)/g)].map((match) => match[1]);
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(existsSync(join(root, link)), `${link} should exist`).toBe(true);
  });

  it("marks the pre-rename map as historical in the final baseline", () => {
    const baseline = read("docs/FINAL_BASELINE_323.md");
    expect(baseline).toContain("snapshot histórico pré-rename");
    expect(baseline).toContain("Leaked Password Protection");
    expect(baseline).toContain("#284–#353");
  });
});
