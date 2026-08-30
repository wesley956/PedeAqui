import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

const home = read("src/app/page.tsx");
const plans = read("src/app/planos/page.tsx");
const login = read("src/app/login/page.tsx");
const loginCss = read("src/app/login/login-commercial.module.css");
const shell = read("src/components/marketing/marketing-shell.tsx");
const marketingCss = read("src/components/marketing/marketing.module.css");

describe("commercial site final polish", () => {
  it("keeps login reachable from the public home and mobile navigation", () => {
    expect(home).toContain('href="/login"');
    expect(home).toContain("Entrar no painel");
    expect(shell).toContain('href="/login" className={styles.mobileLoginLink}');
    expect(shell).toContain("Pular para o conteúdo");
  });

  it("keeps the mobile login form ahead of long promotional copy", () => {
    expect(loginCss).toContain(".storyBody h1,\n  .storyLead { display: none; }");
    expect(loginCss).toContain("min-height: calc(100vh - 68px)");
    expect(login).toContain('title: "Entrar"');
  });

  it("publishes the current active commercial plan prices", () => {
    for (const [name, price] of [
      ["Personalizado", "R$ 69,90"],
      ["Fundadores", "R$ 79,90"],
      ["Essencial", "R$ 89,90"],
      ["Profissional", "R$ 129,90"],
      ["Completo", "R$ 179,90"],
    ]) {
      expect(plans).toContain(name);
      expect(plans).toContain(price);
    }
    expect(plans).toContain("/ mês + módulos");
    expect(plans).toContain("A disponibilidade é confirmada no momento da contratação");
  });

  it("keeps keyboard focus visible in the commercial experience", () => {
    expect(marketingCss).toContain(":focus-visible");
    expect(marketingCss).toContain("outline: 3px solid");
  });
});
