import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8").replace(/\s+/g, " ");

describe("platform admin v3 commercial safety", () => {
  it("groups the owner navigation without removing the existing operational destinations", () => {
    const layout = read("src/app/platform/layout.tsx");
    for (const group of ["Início", "Clientes", "Comercial", "Operação", "Suporte e plataforma"]) expect(layout).toContain(group);
    for (const route of ["/platform/assinaturas", "/platform/operacao", "/platform/integracoes", "/platform/incidentes", "/platform/alertas", "/platform/suporte", "/platform/suporte/modo", "/platform/integridade"]) expect(layout).toContain(route);
    expect(layout).toContain("/platform/produto");
  });

  it("keeps custom-plan simulation non-destructive and dependency-aware", () => {
    const composer = read("src/app/platform/produto/plan-composer.tsx");
    expect(composer).toContain("dependenciesFor");
    expect(composer).toContain('item.kind === "core"');
    expect(composer).toContain("não altera contrato, assinatura nem módulos de cliente real");
    expect(composer).not.toContain("use server");
  });

  it("keeps module access guarded by RBAC, store configuration and entitlements", () => {
    const access = read("src/server/modules/module-access-service.ts");
    expect(access).toContain("entitlementAllowedByModule");
    expect(access).toContain("permissionAllowedByModule");
    expect(access).toContain("enabledModuleKeys");
    expect(access).toContain("legacy restaurant missing a module row must never lose an existing surface during modular rollout");
  });

  it("keeps module disablement behind dependency and operational blockers", () => {
    const configuration = read("src/server/modules/module-configuration-service.ts");
    expect(configuration).toContain("operationalBlockers");
    expect(configuration).toContain("cash_session_open");
    expect(configuration).toContain("delivery_in_progress");
    expect(configuration).toContain("ModuleConfigurationError");
  });

  it("routes legacy restaurant 360 links through the canonical unit resolver", () => {
    const legacy = read("src/app/platform/restaurantes/[storeId]/page.tsx");
    const unit = read("src/app/platform/unidades/[storeId]/page.tsx");
    expect(legacy).toContain("/platform/unidades/${storeId}");
    expect(unit).toContain("/platform/empresas/${data.organization_id}/unidades/${storeId}");
  });

  it("preserves immutable commercial history and protected pricing", () => {
    const migration = read("supabase/sql/123_subscription_addons_contract_changes.sql");
    const billing = read("src/server/platform/platform-commercial-billing-service.ts");
    expect(migration).toContain("contract history cannot be deleted");
    expect(migration).toContain("subscription_change_requests");
    expect(billing).toContain("priceLocked");
    expect(billing).toContain("founderSlot");
  });
});
