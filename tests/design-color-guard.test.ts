import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("cores do tema", () => {
  it("não aceita cores de estado digitadas nem texto branco sobre laranja ou vermelho", () => {
    const run = () => execFileSync("node", ["scripts/design-color-codemod.mjs", "--check"], { encoding: "utf8" });
    expect(run).not.toThrow();
  });

  it("separa superfícies pela borda no tema escuro", () => {
    const globals = readFileSync("src/app/globals.css", "utf8");
    expect(globals).toContain("--shadow-sm: none;");
    expect(globals).toContain("--shadow-md: none;");
  });

  it("mostra preço do PDV na cor do texto, não em laranja", () => {
    expect(readFileSync("src/features/pdv/pdv.module.css", "utf8")).toContain(".productPrice{color:var(--text-primary)");
  });
});
