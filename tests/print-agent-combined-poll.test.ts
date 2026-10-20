import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const route = read("src/app/api/print-agent/poll/route.ts");
const agent = read("print-agent/src/index.mjs");
const alerts = read("print-agent/src/order-alert.mjs");

describe("poll combinado do Print Agent (fase 2)", () => {
  it("servidor: uma rota autenticada entrega impressão e alertas juntos", () => {
    expect(route).toContain("authenticatePrintAgentRequest(request)");
    expect(route).toContain('{ error: "unauthorized" }');
    expect(route).toContain("PrintQueueService.claim(agent");
    expect(route).toContain("OrderAlertBackupService.pollForAgent(agent");
    expect(route).toContain("closeExhaustedPrintJobsThrottled(agent)");
  });

  it("servidor: falha nos alertas não derruba a entrega de trabalhos", () => {
    expect(route).toContain(".catch((error: unknown)");
    expect(route).toContain("return null;");
    expect(route).toContain("NextResponse.json({ jobs, alerts })");
  });

  it("servidor: rotas antigas continuam existindo para agentes 0.7.2", () => {
    expect(read("src/app/api/print-agent/claim/route.ts")).toContain("PrintQueueService.claim");
    expect(read("src/app/api/print-agent/order-alerts/route.ts")).toContain("pollForAgent");
  });

  it("agente: usa /poll e cai para /claim se o servidor responder 404", () => {
    expect(agent).toContain('post("/api/print-agent/poll", body)');
    expect(agent).toContain('post("/api/print-agent/claim", { limit: 5 })');
    expect(agent).toContain("error?.status !== 404");
    expect(agent).toContain("combinedPollUnavailableUntil = Date.now() + combinedPollRetryMs");
    expect(agent).toContain("combinedPoll: true");
  });

  it("agente: não faz mais o poll de alertas fixo, só como rede de segurança", () => {
    expect(agent).toContain("setInterval(pollAlertsIfStale, orderAlertPollMs)");
    expect(agent).not.toContain("setInterval(() => void pollNativeOrderAlerts");
    expect(agent).toContain("lastNativeOrderAlertCheckAt() < orderAlertPollMs * 2");
  });

  it("agente: o som toca em segundo plano e não atrasa a impressão", () => {
    expect(alerts).toContain("void playNativeAlert(apiUrl).finally(");
    expect(alerts).toContain("export function handleNativeOrderAlertResult");
  });
});
