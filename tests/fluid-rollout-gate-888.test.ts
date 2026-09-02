import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
const runbook = readFileSync("docs/qa/FLUID_ROLLOUT_888.md", "utf8");

describe("fluid rollout gate #888", () => {
  it("provides one reproducible command for the automated risk matrix", () => {
    const command = pkg.scripts["test:fluid-rollout"];
    expect(command).toBeTruthy();
    for (const suite of [
      "manual-delivery-flow", "delivery-operations", "operational-realtime-resilience",
      "operational-queues-completeness", "print-agent-token", "concurrency-contracts",
      "access-isolation-contracts", "commercial-plan-module-entitlements",
      "mobile-full-layout-qa", "full-accessibility-qa", "courier-route-residual-843",
    ]) expect(command).toContain(suite);
  });

  it("does not confuse automated evidence with real pilot approval", () => {
    for (const guardrail of [
      "nunca Dona Maria sem autorização", "pendente de opt-in", "Dom Burger: pendente",
      "rollout geral", "aprovação explícita", "não foi alterada",
    ]) expect(runbook).toContain(guardrail);
  });

  it("defines load, degraded operation and rollback evidence still required", () => {
    for (const scenario of [
      "50 pedidos em 30 minutos", "queda e retorno real de internet",
      "Print Agent desligado", "produto esgotado", "pagamento atrasado",
      "Rollback de aplicação", "migration posterior e auditável",
    ]) expect(runbook).toContain(scenario);
  });
});
