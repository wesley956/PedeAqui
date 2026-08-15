import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");
const layout = read("src/app/platform/layout.tsx");
const page = read("src/app/platform/page.tsx");
const search = read("src/app/platform/organization-search.tsx");
const overview = read("src/server/platform/platform-owner-overview-service.ts");
const platform = read("src/server/platform/platform-admin-service.ts");
const actions = read("src/features/platform-admin/actions.ts");

describe("Painel do Proprietário foundation [337]", () => {
  it("has a dedicated PedeAqui shell with the complete support navigation foundation", () => {
    expect(layout).toContain("PedeAquiLogo");
    expect(layout).toContain("ThemeSelector");
    expect(layout).toContain("PlatformAdminService.access()");
    for (const label of ["Visão geral", "Empresas", "Operação", "Integrações", "Assinaturas", "Incidentes", "Suporte", "Configuração"]) {
      expect(layout).toContain(label);
    }
  });

  it("keeps support read-only while super admin owns commercial and technical mutations", () => {
    expect(platform).toContain('role as "super_admin"|"support"');
    expect(platform).toContain("requirePlatformAdmin(true)");
    expect(page).toContain('const canManage = data.role === "super_admin"');
    expect(page).toContain("{canManage ? <details");
  });

  it("searches both companies and units without privileged clients in the browser", () => {
    expect(page).toContain("<OrganizationSearch organizations={organizations} units={units}");
    expect(search).toContain("Buscar empresa, unidade ou plano");
    expect(search).toContain("filteredOrganizations");
    expect(search).toContain("filteredUnits");
    expect(search).not.toContain("createAdminClient");
    expect(search).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(search).not.toContain("process.env");
  });

  it("gates aggregate platform reads before service-role access and never loads customer snapshots", () => {
    const gateAt = overview.indexOf("await PlatformAdminService.access()");
    const adminAt = overview.indexOf("createAdminClient()", gateAt);
    expect(gateAt).toBeGreaterThan(-1);
    expect(adminAt).toBeGreaterThan(gateAt);
    expect(overview).toContain('select("store_id,order_status,created_at")');
    expect(overview).toContain('integration_webhook_deliveries');
    expect(overview).not.toContain('select("*")');
    expect(overview).not.toContain("customer_name_snapshot");
    expect(overview).not.toContain("customer_phone_snapshot");
    expect(overview).not.toContain("address_street_snapshot");
    expect(overview).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("provides aggregated operations and incident health without exposing internal roadmap language", () => {
    expect(page).toContain("Pedidos 24h");
    expect(page).toContain('id="operacao"');
    expect(page).toContain('id="incidentes"');
    expect(page).toContain("integrationAlerts");
    expect(page).not.toContain("[338]");
    expect(page).not.toContain("[340]");
  });

  it("records intervention context on subscription changes", () => {
    expect(actions).toContain('text(formData,"reason")');
    expect(actions).toContain('optional(formData,"protocol")');
    expect(platform).toContain("reason:input.reason");
    expect(platform).toContain("protocol:input.protocol??null");
    expect(platform).toContain("actor_user_id:user.id");
  });
});
