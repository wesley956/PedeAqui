import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/features/printing/actions", () => ({ requestAgentDiagnosticAction: vi.fn(), cancelAgentDiagnosticAction: vi.fn() }));
import { RemotePrintingDiagnostics } from "@/features/printing/remote-diagnostics";
const agents = [{ id: "agent-a", name: "Notebook piloto", active: true, capabilities: { onDemandDiagnostics: true } }];
const request = { id: "request-a", agent_id: "agent-a", status: "pending", requested_at: "2026-10-29T12:00:00.000Z", expires_at: "2026-11-05T12:00:00.000Z", completed_at: null, report: null };
describe("remote diagnostic operator interface", () => {
  it("offers explicit request and result refresh without needing a connected computer", () => {
    const html = renderToStaticMarkup(createElement(RemotePrintingDiagnostics, { agents, snapshot: { status: "ready", requests: [] } }));
    expect(html).toContain("Solicitar diagnóstico de Notebook piloto");
    expect(html).toContain("Atualizar resultados"); expect(html).not.toContain("disabled");
  });
  it("disables repeated requests and exposes cancellation while awaiting the computer", () => {
    const html = renderToStaticMarkup(createElement(RemotePrintingDiagnostics, { agents, snapshot: { status: "ready", requests: [request] } }));
    expect(html).toContain('disabled=""'); expect(html).toContain("Cancelar solicitação de Notebook piloto");
    expect(html).toContain("Aguardando relatório do computador"); expect(html).not.toContain("Relatório recebido");
  });
  it("shows an unavailable read instead of claiming a healthy diagnostic", () => {
    const html = renderToStaticMarkup(createElement(RemotePrintingDiagnostics, { agents, snapshot: { status: "unavailable", requests: [] } }));
    expect(html).toContain("indisponível"); expect(html).not.toContain("Solicitar diagnóstico");
    expect(renderToStaticMarkup(createElement(RemotePrintingDiagnostics, { agents, snapshot: { status: "hidden", requests: [] } }))).toBe("");
  });
  it("shows partial report evidence without implying physical printing was verified", () => {
    const report = { schemaVersion: 1, agentVersion: "0.8.0", platform: "win32", startedAt: request.requested_at, finishedAt: request.requested_at, checks: [{ name: "runtime", status: "error", code: "interrupted", values: {} }] };
    const html = renderToStaticMarkup(createElement(RemotePrintingDiagnostics, { agents, snapshot: { status: "ready", requests: [{ ...request, status: "completed", report }] } }));
    expect(html).toContain("Relatório recebido"); expect(html).toContain("coleta foi interrompida"); expect(html).toContain("não confirma saída de papel");
  });
});
