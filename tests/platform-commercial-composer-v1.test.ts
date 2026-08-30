import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8").replace(/\s+/g, " ");

describe("platform commercial composer v1", () => {
  it("locks the approved public catalog prices without repricing founders", () => {
    const migration = read("supabase/sql/157_platform_commercial_catalog_v1.sql");
    expect(migration).toContain("monthly_price_cents=8990");
    expect(migration).toContain("monthly_price_cents=12990");
    expect(migration).toContain("monthly_price_cents=17990");
    expect(migration).toContain("monthly_price_cents=7990");
    expect(migration).toContain("'custom','Personalizado'");
    expect(migration).toContain("6990");
    expect(migration).not.toContain("insert into public.organization_subscriptions");
  });

  it("keeps fiscal and gas containers out of automatic public add-on sales", () => {
    const migration = read("supabase/sql/157_platform_commercial_catalog_v1.sql");
    expect(migration).toContain("where key='module.fiscal'");
    expect(migration).toContain("where key='module.gas_containers'");
    expect(migration).toContain("'commercial_sellable',false");
  });

  it("restores custom module presets through the privileged preset path", () => {
    const migration = read("supabase/sql/157_platform_commercial_catalog_v1.sql");
    expect(migration).toContain("p_module_preset not in ('essential','complete','custom')");
    expect(migration).toContain("v_result:=public.set_store_modules_internal(p_organization_id,p_store_id,v_changes,'preset'");
    expect(migration).not.toContain("p_module_preset='custom' then 'manual'");
  });

  it("uses immutable plan versions and active add-ons for entitlement resolution", () => {
    const migration = read("supabase/sql/156_platform_commercial_composer_v1.sql");
    expect(migration).toContain("public.plan_version_features");
    expect(migration).toContain("public.subscription_addons");
    expect(migration).toContain("sub.plan_version_id is not null");
    expect(migration).not.toContain("and p.active=true");
  });

  it("guards single-unit scope, protected prices and package integrity at the database boundary", () => {
    const migration = read("supabase/sql/159_platform_commercial_composer_hardening.sql");
    expect(migration).toContain("multiunit_commercial_scope_not_configured");
    expect(migration).toContain("module_config_revision_conflict");
    expect(migration).toContain("protected_price_requires_dedicated_change");
    expect(migration).toContain("package module set must match plan version");
    expect(migration).toContain("custom base price below minimum");
    expect(migration).toContain("module is not available for commercial add-on");
    expect(migration).toContain("platform.commercial_composition.applied");
  });

  it("keeps founder contracts outside the generic composition flow", () => {
    const service = read("src/server/platform/platform-commercial-composer-service.ts");
    const form = read("src/app/platform/produto/commercial-apply-form.tsx");
    expect(service).toContain('plan.key === "founders"');
    expect(service).toContain("plano Fundadores só pode ser alterado pelo fluxo dedicado");
    expect(form).toContain('plan.key !== "founders"');
    expect(form).toContain("Contrato Fundador detectado");
    expect(form).toContain("Boolean(organization?.subscription?.founder_slot)");
  });

  it("separates dry-run simulation from explicit transactional application", () => {
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

describe("customer SaaS subscription and PIX billing v1", () => {
  it("exposes subscription details only through subscription.view", () => {
    const service = read("src/server/billing/customer-subscription-service.ts");
    const navigation = read("src/components/layout/navigation-model.ts");
    expect(service).toContain("PERMISSIONS.SUBSCRIPTION_VIEW");
    expect(service).toContain("CustomerSubscriptionAuthorizationError");
    expect(navigation).toContain('label: "Minha assinatura"');
    expect(navigation).toContain('href: "/assinatura"');
  });

  it("shows contract plan and functional-equivalent plan separately", () => {
    const page = read("src/app/(app)/assinatura/page.tsx");
    const platform = read("src/app/platform/produto/page.tsx");
    expect(page).toContain("Plano comercial");
    expect(page).toContain("Recursos equivalentes");
    expect(page).toContain("Cliente Fundador");
    expect(platform).toContain("Equivalência funcional");
  });

  it("keeps SaaS PIX in a server-only ledger with RLS", () => {
    const migration = read("supabase/sql/158_subscription_pix_billing_v1.sql");
    expect(migration).toContain("create table if not exists public.subscription_pix_charges");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on table public.subscription_pix_charges from public,anon,authenticated");
    expect(migration).toContain("grant select,insert,update on table public.subscription_pix_charges to service_role");
  });

  it("uses isolated platform Mercado Pago credentials and stays safe-off", () => {
    const service = read("src/server/billing/subscription-pix-billing-service.ts");
    expect(service).toContain("PEDEAQUI_BILLING_MERCADO_PAGO_ACCESS_TOKEN");
    expect(service).toContain("PEDEAQUI_BILLING_MERCADO_PAGO_WEBHOOK_SECRET");
    expect(service).toContain("if (!organization.email?.trim() || !platformAccessToken())");
    expect(service).toContain('.not("next_due_at", "is", null)');
    expect(service).toContain('expirationTime: PIX_EXPIRATION');
  });

  it("protects renewal and webhook execution", () => {
    const job = read("src/app/api/internal/subscription-renewals/route.ts");
    const auth = read("src/server/jobs/internal-job-auth.ts");
    const webhook = read("src/app/api/webhooks/subscription-billing/mercado-pago/route.ts");
    expect(job).toContain('authorizeInternalJob(request, "subscription_renewals")');
    expect(auth).toContain('"subscription_renewals"');
    expect(webhook).toContain("validateMercadoPagoWebhookSignature");
    expect(webhook).toContain("RESOURCE_ID");
    expect(webhook).toContain("reconcileByProviderResource");
  });

  it("records paid renewals through the immutable billing services", () => {
    const service = read("src/server/billing/subscription-pix-billing-service.ts");
    expect(service).toContain('admin.rpc("subscription_invoice_save_internal"');
    expect(service).toContain('admin.rpc("subscription_payment_record_internal"');
    expect(service).toContain("platform.subscription_pix_paid");
    expect(service).toContain("next_due_at: nextDueAt");
  });
});
