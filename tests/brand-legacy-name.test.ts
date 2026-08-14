import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();
const legacyBrandPattern = /\bcruz\b/i;
const scannedExtensions = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".md", ".css", ".html", ".txt"]);
const ignoredDirectoryNames = new Set(["node_modules", ".next", "coverage", "dist", "build"]);

function collectFiles(root: string): string[] {
  const absoluteRoot = path.join(repositoryRoot, root);
  if (!fs.existsSync(absoluteRoot)) return [];

  const result: string[] = [];
  const stack = [absoluteRoot];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;

    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.isDirectory() && ignoredDirectoryNames.has(entry.name)) continue;
      const absolutePath = path.join(current, entry.name);

      if (entry.isDirectory()) {
        stack.push(absolutePath);
        continue;
      }

      if (scannedExtensions.has(path.extname(entry.name))) result.push(absolutePath);
    }
  }

  return result;
}

function legacyBrandOccurrences(filePath: string): string[] {
  const relativePath = path.relative(repositoryRoot, filePath);
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

  return lines.flatMap((line, index) => legacyBrandPattern.test(line)
    ? [`${relativePath}:${index + 1}: ${line.trim()}`]
    : []);
}

describe("PedeAqui visible brand guardrail", () => {
  it("does not expose the legacy product name in user-facing surfaces", () => {
    const files = [
      ...collectFiles("src"),
      ...collectFiles("print-agent"),
      ...[
        "README.md",
        "docs/BLUEPRINT_MASTER.md",
        "docs/IMPLEMENTATION_BACKLOG.md",
        "supabase/README.md",
      ].map((file) => path.join(repositoryRoot, file)),
    ];

    const occurrences = files.flatMap(legacyBrandOccurrences);

    expect(
      occurrences,
      `Legacy product name found in user-facing surface(s):\n${occurrences.join("\n")}`,
    ).toEqual([]);
  });
});
