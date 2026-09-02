import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");

describe("saúde operacional global", () => {
  it("fica persistente no topo e usa severidade P0 a P3", () => {
    const topbar = read("src/components/layout/operation-topbar.tsx");
    const indicator = read("src/features/operations/operational-health-indicator.tsx");
    expect(topbar).toContain("OperationalHealthIndicator");
    for (const severity of ["P0", "P1", "P2", "P3"]) expect(indicator).toContain(severity);
    expect(indicator).toContain("Causa:");
    expect(indicator).toContain("Impacto:");
    expect(indicator).toContain("Próxima ação:");
  });

  it("detecta agente sem heartbeat, fila parada e duas falhas como P0", () => {
    const service = read("src/server/operations/operational-health-service.ts");
    expect(service).toContain("staleAgentMs = 2 * 60_000");
    expect(service).toContain("stuckJobMs = 2 * 60_000");
    expect(service).toContain('failedJobs.length >= 2 ? "P0" : "P1"');
    expect(service).toContain("Computador de impressão sem sinal");
    expect(service).toContain("Fila de impressão parada");
  });

  it("não transforma impressão opcional ou pagamento manual pendente em falha", () => {
    const service = read("src/server/operations/operational-health-service.ts");
    expect(service).toContain("printingConfigured && onlineAgents.length === 0");
    expect(service).toContain('order_payment_provider_configs');
    expect(service).not.toContain('from("payments")');
    expect(service).toContain("Formas manuais continuam seguindo a configuração do restaurante");
  });

  it("oferece recuperação e exige confirmação auditada para reconhecimento manual", () => {
    const indicator = read("src/features/operations/operational-health-indicator.tsx");
    const actions = read("src/features/printing/actions.ts");
    const queue = read("src/server/printing/print-queue-service.ts");
    expect(indicator).toContain("retryPrintJobAction");
    expect(indicator).toContain("recognizePrintedJobAction");
    expect(indicator).toContain("Confirmo que o documento realmente foi impresso");
    expect(actions).toContain('formData.get("confirmed") !== "on"');
    expect(queue).toContain("print.job_manually_recognized");
    expect(queue).toContain("AuditService.record");
  });

  it("não expõe segredo ou erro bruto do provedor na interface", () => {
    const service = read("src/server/operations/operational-health-service.ts");
    const indicator = read("src/features/operations/operational-health-indicator.tsx");
    expect(service).not.toContain("access_token_secret_id");
    expect(service).not.toContain("webhook_secret_id");
    expect(indicator).not.toContain("last_error_code");
    expect(indicator).not.toContain("last_error");
  });
});
