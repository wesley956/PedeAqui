import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/app/(app)/financeiro/page.tsx", "utf8");
const chart = readFileSync("src/features/finance/cashflow-chart.tsx", "utf8");

describe("gráfico do Financeiro", () => {
  it("mostra o saldo diário que o relatório já calcula", () => {
    expect(page).toContain("<CashflowChart daily={report.cashflow.daily ?? []} />");
    expect(page).toContain("Entradas e saídas por dia");
  });

  it("desenha barras a partir do zero, com estado vazio e leitura acessível", () => {
    expect(chart).toContain("const zero = y(0);");
    expect(chart).toContain("Sem entradas ou saídas realizadas no período.");
    expect(chart).toContain('role="img"');
    expect(chart).toContain("<title>");
  });
});
