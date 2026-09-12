import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/app/(app)/crescimento/page.tsx", "utf8");
const wizard = readFileSync("src/app/(app)/crescimento/growth-objective-wizard.tsx", "utf8");
const styles = readFileSync("src/app/(app)/crescimento/growth.module.css", "utf8");

describe("growth commercial workspace [335]", () => {
  it("starts with outcomes and clear module navigation", () => {
    expect(page).toContain("Faça seus clientes voltarem");
    expect(page.indexOf("GrowthObjectiveWizard")).toBeLessThan(page.indexOf('aria-label="Resumo de crescimento"'));
    for (const outcome of ["Fidelizar clientes", "Trazer clientes de volta", "Criar uma promoção", "Aumentar a frequência", "Enviar campanha ou anúncio", "Premiar melhores clientes", "Acompanhar resultados"]) expect(wizard).toContain(outcome);
    for (const target of ["#fidelidade", "#cupons", "#clientes", "#campanhas", "#automacoes"]) expect(page).toContain(target);
    expect(page).toContain('aria-label="Resumo de crescimento"');
  });

  it("keeps creation forms collapsed until the restaurant asks for them", () => {
    for (const summary of ["Editar regras de fidelidade", "Criar novo cupom", "Criar grupo personalizado", "Criar campanha", "Criar automação"]) expect(page).toContain(`<summary>${summary}</summary>`);
    expect(page.match(/<details/g)?.length).toBeGreaterThanOrEqual(5);
    expect(page).toContain("Modo avançado");
    expect(page).not.toContain('<details className={styles.advanced} open>');
  });

  it("preserves every existing growth action and field contract", () => {
    for (const action of ["saveGrowthSettingsAction", "createCouponAction", "createSegmentAction", "createCampaignAction", "prepareCampaignAction", "createAutomationAction", "runGrowthAutomationsAction"]) expect(page).toContain(action);
    for (const action of ["saveGrowthSettingsAction", "createCouponAction", "createSegmentAction", "createCampaignAction", "createAutomationAction"]) expect(wizard).toContain(action);
    for (const field of ["cashbackEnabled", "cashbackRate", "code", "discountType", "ordersCountMin", "segmentId", "triggerType", "actionType", "orderChannel"]) expect(page).toContain(`name=\"${field}\"`);
  });

  it("uses responsive cards instead of the old large coupon table", () => {
    expect(page).not.toContain("<table");
    expect(styles).toContain(".metrics");
    expect(styles).toContain(".customerGrid");
    expect(styles).toContain(".objectiveGrid");
    expect(styles).toMatch(/@media\s*\(max-width:\s*680px\)/);
  });

  it("uses presets as reviewable drafts and never sends automatically", () => {
    for (const preset of ["15 dias", "30 dias", "60 dias", "Cupom de retorno", "Fim de semana", "Pós-compra", "Aniversário", "5+ pedidos"]) expect(wizard).toContain(preset);
    expect(wizard).toContain("Confira antes de criar");
    expect(wizard).toContain("Nada será enviado ao cliente agora");
    expect(wizard).not.toContain("enqueueCampaignAction");
  });
});
