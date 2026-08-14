import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sourceRoot = path.join(root, "src");
const globalsPath = path.join(sourceRoot, "app", "globals.css");

const requiredSemanticTokens = [
  "--brand-primary",
  "--brand-primary-hover",
  "--brand-primary-active",
  "--brand-highlight",
  "--brand-graphite",
  "--brand-graphite-deep",
  "--brand-graphite-soft",
  "--brand-warm-white",
  "--surface-0",
  "--surface-1",
  "--surface-2",
  "--surface-3",
  "--text-primary",
  "--text-secondary",
  "--text-inverse",
  "--text-on-brand",
  "--border-default",
  "--border-strong",
  "--focus-ring",
  "--state-success",
  "--state-success-text",
  "--state-success-surface",
  "--state-warning",
  "--state-warning-text",
  "--state-warning-surface",
  "--state-danger",
  "--state-danger-text",
  "--state-danger-surface",
  "--state-info",
  "--state-info-text",
  "--state-info-surface",
] as const;

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(fullPath);
    return /\.(css|ts|tsx)$/.test(entry.name) ? [fullPath] : [];
  });
}

function tokensMatching(content: string, pattern: RegExp): string[] {
  return [...content.matchAll(pattern)].flatMap((match) => match[1] ? [match[1]] : []);
}

describe("PedeAqui semantic design tokens", () => {
  it("defines the required semantic color contract in globals.css", () => {
    const globals = fs.readFileSync(globalsPath, "utf8");
    const defined = new Set(tokensMatching(globals, /(--[a-z0-9-]+)\s*:/gi));

    expect(
      requiredSemanticTokens.filter((token) => !defined.has(token)),
      "Required semantic token(s) missing from globals.css",
    ).toEqual([]);
  });

  it("does not reference undefined CSS custom properties in src", () => {
    const files = sourceFiles(sourceRoot);
    const definitions = new Set<string>();
    const references: Array<{ token: string; file: string }> = [];

    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      for (const token of tokensMatching(content, /(?:["']?)(--[a-z0-9-]+)(?:["']?)\s*:/gi)) definitions.add(token);
      for (const token of tokensMatching(content, /var\(\s*(--[a-z0-9-]+)/gi)) {
        references.push({ token, file: path.relative(root, file) });
      }
    }

    const undefinedReferences = references
      .filter(({ token }) => !definitions.has(token))
      .map(({ token, file }) => `${file}: ${token}`)
      .sort();

    expect(
      undefinedReferences,
      `Undefined CSS custom property reference(s):\n${undefinedReferences.join("\n")}`,
    ).toEqual([]);
  });
});
