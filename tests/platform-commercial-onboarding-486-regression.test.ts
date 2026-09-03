import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("#486 commercial mobile onboarding regression", () => {
  const platform = read("src/app/platform/page.tsx");
  const form = read("src/app/platform/novo-restaurante/page.tsx");
  const demo = read("src/app/platform/demo/page.tsx");
  const actions = read("src/features/platform-commercial-onboarding/actions.ts");
  const service = read("src/server/platform/platform-commercial-onboarding-service.ts");
  const overview = read("src/server/platform/platform-owner-overview-service.ts");
  const migration = read("supabase/sql/101_platform_commercial_onboarding.sql");

  it("keeps the sales visit mobile-first and one-tap", () => {
    expect(platform).toContain('href="/platform/demo"');
    expect(platform).toContain("Abrir demonstração");
    expect(platform).toContain('href="/platform/novo-restaurante"');
    expect(platform).toContain("+ Novo restaurante");
    expect(form).toContain('fontSize: "clamp(28px, 7vw, 40px)"');
    expect(form).toContain("minHeight: 48");
    expect(form).toContain("repeat(auto-fit,minmax(180px,1fr))");
  });

  it("keeps restaurant creation minimal and independent from WhatsApp", () => {
    expect(form).toContain('name="organizationName"');
    expect(form).toContain('name="storeName"');
    expect(form).toContain('name="ownerEmail"');
    expect(form).not.toContain('name="whatsapp"');
    expect(form).not.toContain('name="password"');
    expect(form).toContain("Configurar depois");
    expect(migration).toContain("false, 'meta_cloud', 'not_connected', 'not_started'");
  });

  it("keeps cross-tenant provisioning restricted to platform super admin and service role", () => {
    expect(service).toContain('access.role !== "super_admin"');
    expect(migration).toMatch(/revoke all on function public\.platform_provision_restaurant_internal[\s\S]*from public, anon, authenticated/i);
    expect(migration).toMatch(/grant execute on function public\.platform_provision_restaurant_internal[\s\S]*to service_role/i);
    expect(actions).toContain("PlatformCommercialOnboardingService.provision");
  });

  it("never creates a default password and keeps owner invitation bounded", () => {
    expect(service).toContain("inviteUserByEmail");
    expect(service.toLowerCase()).not.toContain("default_password");
    expect(migration).toContain("platform_owner");
    expect(migration).toContain("now() + interval '7 days'");
  });

  it("keeps demo data isolated from real commercial readiness", () => {
    expect(service).toContain('.eq("platform_demo", true)');
    expect(overview).toContain("platform_demo");
    expect(platform).toContain("!unit.isDemo");
    expect(demo).toContain("PlatformCommercialOnboardingService.ensureDemo");
    expect(service).toContain('p_platform_demo: true');
  });

  it("keeps post-create shortcuts valid for public menu and platform 360 views", () => {
    expect(form).toContain('href={`/m/${slug}`}');
    expect(form).toContain("/platform/empresas/${organizationId}/unidades/${storeId}");
    expect(form).toContain("/platform/unidades/${storeId}");
    expect(platform).toContain("/platform/restaurantes/${unit.id}");
  });
});
