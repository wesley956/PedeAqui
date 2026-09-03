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

  it("reuses an in-flight setup test and deduplicates concurrent replay without duplicating audit", () => {
    const queue = read("src/server/printing/print-queue-service.ts");
    expect(queue).toContain("SETUP_TEST_REPLAY_WINDOW_MS");
    expect(queue).toContain("SETUP_TEST_RACE_BUCKET_MS");
    expect(queue).toContain('.in("status", ["pending", "processing"])');
    expect(queue).toContain('if (inFlight?.id) return inFlight.id');
    expect(queue).toContain('error.code === "23505"');
    expect(queue).toContain('.eq("idempotency_key", idempotencyKey)');
    expect(queue).toContain('action: "print.setup_test_queued"');
    expect(queue.indexOf('action: "print.setup_test_queued"')).toBeGreaterThan(queue.indexOf('if (error) {'));
  });

  it("keeps configuration replay-safe and audits only effective changes", () => {
    const config = read("src/server/printing/print-config-service.ts");
    const quickSetupMigration = read("supabase/sql/183_printing_idempotency_hardening.sql");
    const manualPrinterMigration = read("supabase/sql/184_printing_manual_printer_idempotency.sql");
    expect(quickSetupMigration).toContain("printers_store_agent_system_address_unique");
    expect(quickSetupMigration).toContain("where connection_type = 'system'");
    expect(manualPrinterMigration).toContain("print_create_printer_idempotent_internal");
    expect(manualPrinterMigration).toContain("pg_advisory_xact_lock");
    expect(manualPrinterMigration).toContain("created_at >= now() - interval '15 minutes'");
    expect(manualPrinterMigration).toContain("'created', false");
    expect(config).toContain('admin.rpc("print_create_printer_idempotent_internal"');
    expect(config).toContain("if (result.created) {");
    expect(config).toContain("if (Number(before.default_copies) === copies)");
    expect(config).toContain("JSON.stringify(resolveOrderPrintPreferences(before))");
    expect(config).toContain("if (existing && Number(existing.priority) === safePriority");
    expect(config).toContain("if (existing) return;");
    expect(config).toContain('if (error.code === "23505")');
    expect(config).toContain("if (changed) {");
  });

  it("replays Print Agent creation/reconnect by explicit intent without storing plaintext credentials", () => {
    const creator = read("src/features/printing/agent-token-creator.tsx");
    const actions = read("src/features/printing/actions.ts");
    const admin = read("src/server/printing/print-agent-admin-service.ts");
    const migration = read("supabase/sql/185_print_agent_credential_idempotency.sql");
    expect(creator).toContain("Baixar instalador assistido (Windows)");
    expect(creator).toContain("Configuração manual");
    expect(creator).toContain("launch.vbs");
    expect(creator).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(creator).toContain("useId()");
    expect(creator).toContain("intentKey(");
    expect(creator).toContain("state.intentRevision");
    expect(creator).toContain('name="idempotencyKey" value={idempotencyKey}');
    expect(actions).toContain('text(formData, "idempotencyKey")');
    expect(actions).toContain("intentRevision");
    expect(migration).toContain("credential_version");
    expect(migration).toContain("print_agent_create_idempotent_internal");
    expect(migration).toContain("print_agent_reconnect_idempotent_internal");
    expect(migration).toContain("public.idempotency_keys");
    expect(migration).toContain("'printing.agent.create'");
    expect(migration).toContain("'printing.agent.reconnect'");
    expect(migration).toContain("'replayed', true");
    expect(admin).toContain("derivePrintAgentToken");
    expect(admin).toContain('admin.rpc("print_agent_create_idempotent_internal"');
    expect(admin).toContain('admin.rpc("print_agent_reconnect_idempotent_internal"');
    expect(admin).toContain("result.created && !result.replayed");
    expect(admin).toContain("result.rotated && !result.replayed");
    expect(admin).toContain("credentialRotated");
    expect(admin).not.toContain("createPrintAgentToken()");
  });

  it("installs a least-privilege boot task and validates the first server communication", () => {
    const creator = read("src/features/printing/agent-token-creator.tsx");
    expect(creator).toContain("New-ScheduledTaskTrigger -AtStartup");
    expect(creator).toContain("NT AUTHORITY\\\\LOCAL SERVICE");
    expect(creator).toContain("-LogonType ServiceAccount -RunLevel Limited");
    expect(creator).toContain("Register-ScheduledTask");
    expect(creator).toContain("Start-ScheduledTask");
    expect(creator).toContain("/api/print-agent/config");
    expect(creator).toContain("-Method Post");
    expect(creator).toContain(":task_error");
    expect(creator).toContain(":validation_error");
    expect(creator).not.toContain("\\\\Start Menu\\\\Programs\\\\Startup");
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
