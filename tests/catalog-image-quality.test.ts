import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const optimizer = readFileSync("src/server/catalog/catalog-image-optimizer.ts", "utf8");
const picker = readFileSync("src/components/media/image-upload-field.tsx", "utf8");

describe("catalog image quality guardrails", () => {
  it("keeps product photos at high quality and resolution", () => {
    expect(optimizer).toContain("OPTIMIZED_CATALOG_IMAGE_QUALITY = 92");
    expect(optimizer).toContain('purpose === "product"');
    expect(optimizer).toContain("return 1920");
    expect(optimizer).toContain("sharp.kernel.lanczos3");
    expect(optimizer).toContain("smartSubsample: true");
  });

  it("does not enlarge low-resolution originals", () => {
    expect(optimizer).toContain("withoutEnlargement: true");
  });

  it("guides restaurants to upload sufficiently large originals", () => {
    expect(picker).toContain("pelo menos 1200 px no lado maior");
  });
});
