import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

const canonicalAssets = [
  "public/brand/pedeaqui-logo.svg",
  "public/brand/pedeaqui-logo-on-dark.svg",
  "public/brand/pedeaqui-symbol.svg",
] as const;

const centralBrandSurfaces = [
  "src/components/auth/auth-card.tsx",
  "src/components/layout/app-shell.tsx",
  "src/app/m/[slug]/page.tsx",
] as const;

const requiredGuardrails = [
  "tests/brand-legacy-name.test.ts",
  "tests/brand-components.test.ts",
  "tests/design-tokens.test.ts",
  "tests/structural-tokens.test.ts",
] as const;

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function legacyBrandOccurrences(content: string) {
  return content
    .split(/\r?\n/)
    .map((line, index) => ({ line: index + 1, value: line.trim() }))
    .filter(({ value }) => /\bcruz\b/i.test(value));
}

function undefinedCssTokenReferences(content: string) {
  const definitions = new Set(
    [...content.matchAll(/(--[a-z0-9-]+)\s*:/gi)]
      .map((match) => match[1])
      .filter((token): token is string => Boolean(token)),
  );
  const references = [...content.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)]
    .map((match) => match[1])
    .filter((token): token is string => Boolean(token));

  return references.filter((token) => !definitions.has(token));
}

describe("PedeAqui visual identity guardrails", () => {
  it("keeps every canonical brand asset versioned as real SVG", () => {
    for (const relativePath of canonicalAssets) {
      const absolutePath = path.join(root, relativePath);
      expect(fs.existsSync(absolutePath), `${relativePath} must exist`).toBe(true);
      const source = read(relativePath).trim();
      expect(source, `${relativePath} must be an SVG document`).toMatch(/^<svg\b/i);
      expect(source, `${relativePath} must expose a viewBox`).toMatch(/\bviewBox=/i);
    }
  });

  it("keeps central product surfaces on the official PedeAqui component", () => {
    for (const relativePath of centralBrandSurfaces) {
      const source = read(relativePath);
      expect(source, `${relativePath} must import the official brand component`).toContain("@/components/brand/pedeaqui-brand");
      expect(source, `${relativePath} must render PedeAquiLogo`).toContain("<PedeAquiLogo");
      expect(source, `${relativePath} must not recreate an inline logo SVG`).not.toContain("<svg");
    }
  });

  it("keeps every identity guardrail in the test suite", () => {
    for (const relativePath of requiredGuardrails) {
      expect(fs.existsSync(path.join(root, relativePath)), `${relativePath} must remain versioned`).toBe(true);
    }
  });

  it("keeps technical legacy-name exceptions explicit and temporary", () => {
    const exceptions = read("docs/TECHNICAL_RENAME_EXCEPTIONS.md");
    expect(exceptions).toContain("wesley956/cruz");
    expect(exceptions).toContain('name: "cruz"');
    expect(exceptions).toContain("[320]–[322]");
    expect(exceptions).toContain("Nenhuma nova superfície user-facing pode introduzir `Cruz`");
  });

  it("proves the legacy-name detector fails on a controlled regression fixture", () => {
    const fixture = "<header>Operação Cruz</header>";
    expect(legacyBrandOccurrences(fixture)).toEqual([{ line: 1, value: fixture }]);
    expect(legacyBrandOccurrences("<header>Operação PedeAqui</header>")).toEqual([]);
  });

  it("proves the CSS-token detector fails on a controlled regression fixture", () => {
    const invalidFixture = ":root { --surface-0: #111; } .card { background: var(--surface-missing); }";
    const validFixture = ":root { --surface-0: #111; } .card { background: var(--surface-0); }";

    expect(undefinedCssTokenReferences(invalidFixture)).toEqual(["--surface-missing"]);
    expect(undefinedCssTokenReferences(validFixture)).toEqual([]);
  });
});
