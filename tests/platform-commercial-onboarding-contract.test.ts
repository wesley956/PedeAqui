import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("platform commercial onboarding [349]", () => {
  const migration = read("supabase/sql/101_platform_commercial_onboarding.sql");
  const service = read("src/server/platform/platform-commercial-onboarding-service.ts");
  const page = read("src/app/platform/novo-restaurante/page.tsx");
  const ownerPanel = read("src/app/platform/page.tsx");

  it("keeps cross-tenant provisioning service-role only", () => {
    expect(migration).toContain("platform_provision_restaurant_internal");
    expect(migration).toMatch(/revoke all on function public\.platform_provision_restaurant_internal[\s\S]*from public, anon, authenticated/i);
    expect(migration).toMatch(/grant execute on function public\.platform_provision_restaurant_internal[\s\S]*to service_role/i);
    expect(service).toContain('access.role !== "super_admin"');
  });

  it("does not require WhatsApp to create a restaurant", () => {
    expect(migration).toContain("whatsapp_enabled, provider, connection_status, onboarding_status");
    expect(migration).toContain("false, 'meta_cloud', 'not_connected', 'not_started'");
    expect(page).toContain("Configurar depois");
    expect(page).toContain("não precisa saber o número do restaurante");
  });

  it("creates owner access through a bounded invitation instead of a default password", () => {
    expect(migration).toContain("invitation_kind");
    expect(migration).toContain("platform_owner");
    expect(migration).toContain("now() + interval '7 days'");
    expect(service).toContain("inviteUserByEmail");
    expect(service.toLowerCase()).not.toContain("default_password");
  });

  it("keeps demo data isolated from real restaurant readiness", () => {
    expect(migration).toContain("platform_demo boolean not null default false");
    expect(service).toContain('.eq("platform_demo", true)');
    expect(ownerPanel).toContain("!unit.isDemo");
    expect(ownerPanel).toContain("Abrir demonstração");
    expect(ownerPanel).toContain("+ Novo restaurante");
  });
});
