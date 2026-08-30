import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), "utf8").replace(/\s+/g, " ");

describe("platform commercial composer v1", () => {
  it("locks the approved catalog prices without subscribing customers", () => {
    const migration = read("supabase/sql/157_platform_commercial_catalog_v1.sql");
    for (const price of ["monthly_price_cents=8990", "monthly_price_cents=12990", "monthly_price_cents=17990", "monthly_price_cents=7990"]) expect(migration).toContain(price);
    expect(migration).toContain("'custom','Personalizado'");
    expect(migration).toContain("6990");
    expect(migration).not.toContain("insert into public.organization_subscriptions");
  });

  it("keeps immature segmented modules out of automatic add-on sales", () => {
    const migration = read("supabase/sql/157_platform_commercial_catalog_v1.sql");
    expect(migration).toContain("where key='module.fiscal'");
    expect(migration).toContain("where key='module.gas_containers'");
    expect(migration).toContain("'commercial_sellable',false");
  });

  it("uses the privileged preset path for custom module compositions", () => {
    const migration = read("supabase/sql/157_platform_commercial_catalog_v1.sql");
    expect(migration).toContain("p_module_preset not in ('essential','complete','custom')");
    expect(migration).toContain("v_result:=public.set_store_modules_internal(p_organization_id,p_store_id,v_changes,'preset'");
    expect(migration).not.toContain("p_module_preset='custom' then 'manual'");
  });

  it("resolves entitlements from immutable plan versions plus active add-ons", () => {
    const migration = read("supabase/sql/156_platform_commercial_composer_v1.sql");
    expect(migration).toContain("public.plan_version_features");
    expect(migration).toContain("public.subscription_addons");
    expect(migration).toContain("sub.plan_version_id is not null");
    expect(migration).not.toContain("and p.active=true");
  });

  it("guards scope, price locks and package integrity at the database boundary", () => {
    const migration = read("supabase/sql/159_platform_commercial_composer_hardening.sql");
    for (const guard of ["multiunit_commercial_scope_not_configured", "module_config_revision_conflict", "protected_price_requires_dedicated_change", "package module set must match plan version", "custom base price below minimum", "module is not available for commercial add-on"]) expect(migration).toContain(guard);
    expect(migration).toContain("platform.commercial_composition.applied");
  });

  it("keeps founder contracts outside the generic composer", () => {
    const service = read("src/server/platform/platform-commercial-composer-service.ts");
    const form = read("src/app/platform/produto/commercial-apply-form.tsx");
    expect(service).toContain('plan.key === "founders"');
    expect(service).toContain("plano Fundadores só pode ser alterado pelo fluxo dedicado");
    expect(form).toContain('plan.key !== "founders"');
    expect(form).toContain("Contrato Fundador detectado");
    expect(form).toContain("Boolean(organization?.subscription?.founder_slot)");
  });

  it("separates simulation from explicit transactional application", () => {
    const page = read("src/app/platform/produto/page.tsx");
    const simulator = read("src/app/platform/produto/plan-composer.tsx");
    const form = read("src/app/platform/produto/commercial-apply-form.tsx");
    expect(page).toContain("Simulador livre");
    expect(page).toContain("Aplicar proposta em um cliente");
    expect(simulator).toContain("não altera contrato, assinatura nem módulos de cliente real");
    expect(form).toContain("Aplicar composição");
    expect(form).toContain("A aplicação é transacional");
  });
});
