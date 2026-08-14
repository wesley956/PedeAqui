import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const globals = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8");

const requiredTokens = [
  "--font-sans",
  "--font-size-xs",
  "--font-size-sm",
  "--font-size-md",
  "--font-size-lg",
  "--font-size-xl",
  "--font-size-2xl",
  "--font-size-3xl",
  "--font-size-display",
  "--line-height-tight",
  "--line-height-snug",
  "--line-height-normal",
  "--space-1",
  "--space-2",
  "--space-3",
  "--space-4",
  "--space-5",
  "--space-6",
  "--space-8",
  "--space-10",
  "--space-12",
  "--space-16",
  "--radius-md",
  "--radius-lg",
  "--radius-pill",
  "--shadow-sm",
  "--shadow-md",
  "--shadow-lg",
  "--control-height-sm",
  "--control-height-md",
  "--control-height-lg",
  "--control-height",
  "--content-standard",
  "--content-wide",
  "--breakpoint-mobile",
  "--breakpoint-tablet",
  "--breakpoint-desktop",
  "--breakpoint-wide",
  "--z-sticky",
  "--z-dropdown",
  "--z-modal",
  "--z-toast",
  "--motion-fast",
  "--motion-normal",
  "--motion-slow",
  "--ease-standard",
] as const;

function read(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("PedeAqui structural design tokens", () => {
  it("defines the required structural contract", () => {
    for (const token of requiredTokens) {
      expect(globals, `${token} must be defined`).toMatch(new RegExp(`${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:`));
    }
  });

  it("uses the canonical responsive and accessibility behaviors", () => {
    expect(globals).toContain("@media (pointer: coarse)");
    expect(globals).toContain("--control-height: var(--control-height-lg)");
    expect(globals).toContain("@media (prefers-reduced-motion: reduce)");
    expect(globals).toContain("@media (max-width: 820px)");
    expect(globals).toContain("@media (max-width: 640px)");
  });

  it("applies structural tokens to the shared primitives", () => {
    const button = read("src/components/ui/button.tsx");
    const input = read("src/components/ui/input.tsx");
    const primitives = read("src/components/ui/primitives.tsx");

    expect(button).toContain("var(--control-height)");
    expect(button).toContain("var(--radius-md)");
    expect(button).toContain("var(--motion-fast)");

    expect(input).toContain("var(--control-height)");
    expect(input).toContain("var(--font-size-sm)");
    expect(input).toContain("var(--space-3)");

    expect(primitives).toContain("var(--radius-pill)");
    expect(primitives).toContain("var(--space-5)");
    expect(primitives).toContain("var(--control-height)");
  });

  it("keeps the structural contract documented", () => {
    const docs = read("docs/STRUCTURAL_TOKENS.md");
    expect(docs).toContain("pointer: coarse");
    expect(docs).toContain("prefers-reduced-motion");
    expect(docs).toContain("640 px");
    expect(docs).toContain("820 px");
    expect(docs).toContain("1180 px");
    expect(docs).toContain("1440 px");
  });
});
