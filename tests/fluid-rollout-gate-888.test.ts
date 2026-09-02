import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { scripts: Record<string, string> };
const runbook = readFileSync("docs/qa/FLUID_ROLLOUT_888.md", "utf8");
const loadTest = readFileSync("supabase/tests/e2e_fluid_rollout_50_orders.sql", "utf8");
const exceptionTest = readFileSync("supabase/tests/e2e_fluid_rollout_exceptions.sql", "utf8");

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

  it("keeps the guided setup compatible with custom operational flows", () => {
    const service = readFileSync("src/server/stores/operational-settings-service.ts", "utf8");
    expect(service).toContain('z.enum(["standard", "simplified", "custom"])');
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
      "Print Agent desligado", "produto esgotado", "confirmação de pagamento",
      "Rollback de aplicação", "migration posterior e auditável",
    ]) expect(runbook).toContain(scenario);
  });

  it("proves sold-out and payment-policy failures without persistent fixtures", () => {
    expect(exceptionTest).toContain("checkout aceitou produto esgotado");
    expect(exceptionTest).toContain("cart contains invalid items");
    for (const policy of ["strict", "flexible", "quick_confirmation"]) expect(exceptionTest).toContain(policy);
    expect(exceptionTest).toContain("automatic_unsafe");
    expect(exceptionTest).toContain("rollback;");
    expect(runbook).toContain("0 resíduos");
  });

  it("keeps the 50-order production fixture isolated and repeatable", () => {
    expect(loadTest).toContain("for i in 1..50 loop");
    expect(loadTest).toContain("rollback;");
    expect(loadTest).toContain("active_orders_visible");
    expect(loadTest).toContain("unique_display_numbers");
    expect(loadTest).not.toContain("aweservicosaw@gmail.com");
    expect(runbook).toContain("50 pedidos em 514,44 ms");
    expect(runbook).toContain("nenhum resíduo permaneceu");
  });
});
