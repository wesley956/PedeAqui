import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const operation = readFileSync(join(process.cwd(), "src/app/(app)/caixa/page.tsx"), "utf8");
const settings = readFileSync(join(process.cwd(), "src/app/(app)/configuracoes/caixa/page.tsx"), "utf8");
const hub = readFileSync(join(process.cwd(), "src/app/(app)/configuracoes/page.tsx"), "utf8");
const css = readFileSync(join(process.cwd(), "src/features/cash/cash.module.css"), "utf8");

describe("cash operation UI", () => {
  it("keeps the daily cash flow visible", () => {
    for (const text of ["Abrir turno", "Saldo esperado", "Suprimento", "Sangria", "Fechar e conferir", "Movimentos deste turno"]) expect(operation).toContain(text);
  });

  it("keeps financial actions and permission-driven abilities intact", () => {
    expect(operation).toContain("openCashSessionAction");
    expect(operation).toContain("cashMovementAction.bind(null, \"supply\"");
    expect(operation).toContain("cashMovementAction.bind(null, \"withdrawal\"");
    expect(operation).toContain("closeCashSessionAction");
    for (const ability of ["abilities.open", "abilities.supply", "abilities.withdraw", "abilities.close"]) expect(operation).toContain(ability);
  });

  it("moves register setup out of the shift operation and protects Settings", () => {
    expect(operation).not.toContain("createCashRegisterAction");
    expect(operation).not.toContain("updateCashRegisterAction");
    expect(settings).toContain("createCashRegisterAction");
    expect(settings).toContain("updateCashRegisterAction");
    expect(settings).toContain("authorize(PERMISSIONS.CASH_MANAGE)");
    expect(hub).toContain('href: "/configuracoes/caixa"');
  });

  it("uses semantic tokens, responsive layout and touch controls", () => {
    expect(css).toContain("var(--state-danger-surface)");
    expect(css).toContain("var(--state-success-surface)");
    expect(css).toContain("@media(pointer:coarse)");
    expect(css).toContain("var(--control-height-lg)");
  });
});
