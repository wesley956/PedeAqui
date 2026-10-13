import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const globals = readFileSync("src/app/globals.css", "utf8");

describe("escala visual única", () => {
  it("define a escala do guia nas variáveis do tema", () => {
    expect(globals).toContain("--font-size-support: 0.8125rem;");
    expect(globals).toContain("--font-size-3xl: 1.75rem;");
    expect(globals).toContain("--font-size-page-title: var(--font-size-2xl);");
    expect(globals).toContain("--font-weight-extrabold: 700;");
    expect(globals).toContain("--radius-md: 8px;");
    expect(globals).toContain("--radius-lg: 12px;");
  });

  it("não aceita tamanho de fonte, peso ou raio digitados fora da escala", () => {
    const run = () => execFileSync("node", ["scripts/design-scale-codemod.mjs", "--check"], { encoding: "utf8" });
    expect(run).not.toThrow();
  });
});
