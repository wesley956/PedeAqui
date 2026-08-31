import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("simple printing setup", () => {
  it("keeps the normal printer journey focused on connect, choose and test", () => {
    const page = read("src/app/(app)/configuracoes/impressoes/page.tsx");
    expect(page).toContain("Conecte o computador");
    expect(page).toContain("Escolha a impressora");
    expect(page).toContain("Usar esta impressora");
    expect(page).toContain("Imprimir teste");
    expect(page).toContain("Configuração avançada");
    expect(page).toContain("quickSetupDetectedPrinterAction");
    expect(page).toContain("enqueuePrinterTestAction");
  });

  it("discovers Windows printers through the authenticated Print Agent heartbeat", () => {
    const systemPrint = read("print-agent/src/system-print.mjs");
    const agent = read("print-agent/src/index.mjs");
    const config = read("src/server/printing/print-config-service.ts");
    expect(systemPrint).toContain("Get-CimInstance Win32_Printer");
    expect(agent).toContain("discoveredPrinters");
    expect(agent).toContain("autoDiscovery");
    expect(config).toContain("quickSetupDetectedPrinter");
    expect(config).toContain("discoveredPrinterNames(agent.capabilities)");
    expect(config).toContain("print.quick_setup_completed");
  });

  it("creates a safe default route and a durable physical test job", () => {
    const config = read("src/server/printing/print-config-service.ts");
    const queue = read("src/server/printing/print-queue-service.ts");
    expect(config).toContain('code: "pedidos"');
    expect(config).toContain('kind: "counter"');
    expect(config).toContain('from("station_printers").upsert');
    expect(queue).toContain("enqueueSetupTest");
    expect(queue).toContain('template_key: "setup_test_v1"');
    expect(queue).toContain('document_type: "custom"');
    expect(queue).toContain('source: "panel"');
  });

  it("offers an assisted installer while keeping credentials isolated to the Print Agent", () => {
    const creator = read("src/features/printing/agent-token-creator.tsx");
    const admin = read("src/server/printing/print-agent-admin-service.ts");
    expect(creator).toContain("Baixar instalador assistido (Windows)");
    expect(creator).toContain("Configuração manual");
    expect(creator).toContain("PedeAqui Impressao.vbs");
    expect(creator).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(admin).toContain("reconnect(agentId");
    expect(admin).toContain("credentialRotated");
  });
});

describe("module settings clarity", () => {
  it("keeps module shutdown as a direct inline two-step action", () => {
    const client = read("src/app/(app)/configuracoes/modulos/resources-client.tsx");
    const actions = read("src/features/modules/actions.ts");
    expect(client).toContain('resource.enabled ? "Desativar" : "Ativar"');
    expect(client).toContain('state.status === "confirm" ? "Confirmar"');
    expect(client).toContain("Você permanece nesta mesma posição da página");
    expect(client).toContain("Sempre ativo");
    expect(actions).toContain("O histórico continuará salvo.");
    expect(client).not.toContain("Revisar desativação");
  });
});
