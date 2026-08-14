import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const appRoot = path.join(root, "src/app");

function collectPages(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectPages(absolute);
    return entry.name === "page.tsx" ? [path.relative(root, absolute).replaceAll("\\", "/")] : [];
  });
}

const pages = collectPages(appRoot).sort();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("desktop visual QA [312] — route-by-route evidence", () => {
  it("covers the full application page inventory", () => {
    expect(pages.length).toBeGreaterThan(30);
    expect(pages).toContain("src/app/login/page.tsx");
    expect(pages).toContain("src/app/(app)/dashboard/page.tsx");
    expect(pages).toContain("src/app/(app)/pdv/page.tsx");
    expect(pages).toContain("src/app/m/[slug]/page.tsx");
    expect(pages).toContain("src/app/m/[slug]/checkout/page.tsx");
  });

  for (const page of pages) {
    it(`${page} keeps the user-facing product name canonical`, () => {
      expect(read(page), `${page} must not expose the legacy product name`).not.toMatch(/\bCruz\b/i);
    });
  }

  it("keeps every authenticated desktop page inside the canonical AppShell", () => {
    const layout = read("src/app/(app)/layout.tsx");
    expect(layout).toContain("<AppShell");
    expect(layout).toContain("navigationItems");
    expect(layout).toContain("operationHeader");
  });

  it("preserves the desktop shell geometry and focus contract", () => {
    const css = read("src/app/shell.css").replace(/\s+/g, " ");
    expect(css).toContain("grid-template-columns: 238px minmax(0, 1fr)");
    expect(css).toContain("grid-template-columns: 88px minmax(0, 1fr)");
    expect(css).toContain("position: sticky");
    expect(css).toContain("width: min(100%, var(--content-wide))");
    expect(css).toContain(":focus-visible");
  });

  it("keeps the desktop audit tied to the existing brand and design-system guardrails", () => {
    const doc = read("docs/qa/DESKTOP_VISUAL_QA_312.md");
    for (const guardrail of ["design-tokens.test.ts", "structural-tokens.test.ts", "style-migration.test.ts"]) {
      expect(doc).toContain(guardrail);
    }
    expect(doc).toContain("todo `src/app/**/page.tsx`");
  });
});
