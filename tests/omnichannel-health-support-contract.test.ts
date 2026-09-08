import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const settings = read("src/server/integrations/providers/ifood/ifood-integration-settings-service.ts");
const productionApproval = read("src/server/integrations/rollout/production-capability-approval.ts");
const settingsCard = read("src/app/(app)/configuracoes/integracoes/ifood-connection-card.tsx");
const platformPage = read("src/app/platform/integracoes/page.tsx");
const support = read("src/server/platform/platform-omnichannel-support-service.ts");
const intakeRoute = read("src/app/api/internal/ifood-order-intake/route.ts");
const runbooks = read("docs/OMNICHANNEL_RUNBOOKS.md");

describe("omnichannel health/support contract", () => {
  it("keeps capability activation explicit, store-scoped and reversible", () => {
    expect(settings).toContain("static async setCapability");
    expect(settings).toContain('.eq("store_id", storeId)');
    expect(settings).toContain("capability_enabled");
    expect(settings).toContain("capability_disabled");
    expect(settings).toContain("before,");
    expect(settings).toContain("after: input.enabled");
    expect(settings).not.toContain('.delete()');
    expect(settingsCard).toContain("toggleCapability");
    expect(settingsCard).toContain("Desligar");
    expect(settingsCard).toContain("preserva histórico");
  });

  it("keeps iFood catalog independent and production activation behind store-scoped approval", () => {
    expect(settings).toContain('input.capability === "ifood_catalog" && input.enabled');
    expect(settings).toContain("cardápio e preços independentes");
    expect(settings).toContain('accountResult.data.environment === "production"');
    expect(settings).toContain("isProductionCapabilityApproved(accountResult.data.metadata, storeId, input.capability)");
    expect(productionApproval).toContain("production_capability_approvals");
    expect(productionApproval).toContain("root[storeId]");
    expect(settingsCard).toContain("Aguardando liberação");
  });

  it("surfaces provider/store/capability health without raw payload or secrets", () => {
    expect(platformPage).toContain("PlatformOmnichannelHealthService.load()");
    expect(platformPage).toContain("PlatformOmnichannelSupportService.loadQueue()");
    expect(platformPage).toContain("Inbox:");
    expect(platformPage).toContain("Outbox:");
    expect(platformPage).toContain("Divergências:");
    expect(platformPage).not.toContain("row.payload");
    expect(platformPage).not.toContain("item.payload");
    expect(platformPage).not.toContain("JSON.stringify(row");
    expect(platformPage).not.toContain("access_token");
    expect(platformPage).not.toContain("client_secret");
  });

  it("keeps support recovery RBAC/audited and forbids a free-form forced status", () => {
    expect(support).toContain("PlatformAdminService.access()");
    expect(support).toContain("reprocessEvent");
    expect(support).toContain("reprocessOutbox");
    expect(support).toContain("integration_audit_log");
    expect(support).toContain("reconcileIfoodOrderLifecycle");
    expect(support).not.toContain('.from("orders").update');
    expect(platformPage).toContain("não permite digitar ou forçar status");
  });

  it("updates incidents during the real iFood cycle without making observability an intake dependency", () => {
    expect(intakeRoute).toContain("PlatformOmnichannelHealthService.syncIncidents()");
    expect(intakeRoute).toContain("observability = { failed: true }");
    expect(intakeRoute).toContain("const intake = await runConfiguredIfoodOrderIntake()");
  });

  it("documents the required P0/P1 recovery and capability rollback procedures", () => {
    for (const expected of [
      "iFood polling stopped",
      "iFood token/auth action required",
      "Pedido recebido no iFood mas não importado",
      "Comando aceito, mas estado do pedido divergiu",
      "Cancelamento pendente",
      "99Food indisponível",
      "99Entrega webhook sem atualização",
      "Catálogo batch preso",
      "Rollback de capability por store",
    ]) {
      expect(runbooks).toContain(expected);
    }
  });
});
