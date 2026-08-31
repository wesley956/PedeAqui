import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

const home = read("src/app/page.tsx");
const plans = read("src/app/planos/page.tsx");
const catalog = read("src/server/billing/commercial-catalog-service.ts");
const signup = read("src/app/cadastro/page.tsx");
const onboarding = read("src/app/onboarding/page.tsx");
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

  it("publishes the authoritative three-plan catalog with dynamic prices", () => {
    expect(catalog).toContain('PUBLIC_PLAN_KEYS = ["essential", "professional", "management"]');
    expect(catalog).toContain('.in("key", [...PUBLIC_PLAN_KEYS])');
    expect(plans).toContain("CommercialCatalogService.listPublicPlans()");
    expect(plans).toContain("formatCommercialPrice(plan.monthlyPriceCents");
    expect(plans).toContain("O plano escolhido aqui é o mesmo usado no cadastro");
    expect(plans).toContain("Módulos extras");
    expect(plans).toContain("não é um quarto plano público");
    expect(plans).not.toContain("Personalizado");
    expect(plans).not.toContain("R$ 69,90");
    for (const page of [plans, signup, onboarding]) {
      expect(page).toContain('export const dynamic = "force-dynamic"');
    }
  });

  it("keeps keyboard focus visible in the commercial experience", () => {
    expect(marketingCss).toContain(":focus-visible");
    expect(marketingCss).toContain("outline: 3px solid");
  });
});
