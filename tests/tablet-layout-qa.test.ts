import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8").replace(/\s+/g, " ");

describe("tablet layout QA [313]", () => {
  it("uses a compact sidebar in landscape tablet without switching application state", () => {
    const shell = read("src/app/shell.css");
    expect(shell).toContain("@media (min-width: 901px) and (max-width: 1180px)");
    expect(shell).toContain("grid-template-columns: 88px minmax(0, 1fr)");
    expect(shell).toContain(".nav-link-marker { display: grid; }");
    expect(shell).toContain(".nav-link-label { display: none; }");
  });

  it("uses bottom navigation with safe-area in portrait tablet", () => {
    const shell = read("src/app/shell.css");
    expect(shell).toContain("@media (max-width: 900px)");
    expect(shell).toContain("padding-bottom: calc(64px + env(safe-area-inset-bottom))");
    expect(shell).toContain("padding-bottom: env(safe-area-inset-bottom)");
    expect(shell).toContain(".app-sidebar { display: none; }");
  });

  it("keeps frequent shell controls comfortable on touch", () => {
    const shell = read("src/app/shell.css");
    expect(shell).toContain("@media (pointer: coarse)");
    expect(shell).toContain(".sidebar-toggle, .app-nav-link { min-height: var(--control-height-lg); }");
  });

  it("keeps PDV usable through landscape and portrait tablet breakpoints", () => {
    const css = read("src/features/pdv/pdv.module.css");
    expect(css).toContain("@media(max-width:1100px)");
    expect(css).toContain("minmax(330px,380px)");
    expect(css).toContain("@media(max-width:820px)");
    expect(css).toContain(".cartPanel{position:static;max-height:none}");
    expect(css).toContain("bottom:calc(64px + env(safe-area-inset-bottom))");
    expect(css).toContain("@media(pointer:coarse)");
  });

  it("keeps dining cards and split panels responsive on tablet", () => {
    const css = read("src/features/dining/dining.module.css");
    expect(css).toContain("repeat(auto-fill,minmax(220px,1fr))");
    expect(css).toContain("@media(max-width:980px){.two{grid-template-columns:1fr}}");
    expect(css).toContain("@media(pointer:coarse)");
    expect(css).toContain("var(--control-height-lg)");
  });

  it("keeps KDS and cash operations distance-readable and touch-friendly", () => {
    const kitchen = read("src/features/kitchen/kitchen-board.module.css");
    const cash = read("src/features/cash/cash.module.css");
    expect(kitchen).toContain("minmax(340px,1fr)");
    expect(kitchen).toContain("@media(pointer:coarse)");
    expect(kitchen).toContain("var(--control-height-lg)");
    expect(cash).toContain("@media(pointer:coarse)");
    expect(cash).toContain("var(--control-height-lg)");
  });
});
