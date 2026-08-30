import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), "utf8").replace(/\s+/g, " ");

describe("customer subscription and PIX billing v1", () => {
  it("requires subscription.view and exposes Minha assinatura", () => {
    const service = read("src/server/billing/customer-subscription-service.ts");
    const navigation = read("src/components/layout/navigation-model.ts");
    expect(service).toContain("PERMISSIONS.SUBSCRIPTION_VIEW");
    expect(service).toContain("CustomerSubscriptionAuthorizationError");
    expect(navigation).toContain('label: "Minha assinatura"');
    expect(navigation).toContain('href: "/assinatura"');
  });

  it("shows commercial contract and functional equivalence separately", () => {
    const page = read("src/app/(app)/assinatura/page.tsx");
    const platform = read("src/app/platform/produto/page.tsx");
    expect(page).toContain("Plano comercial");
    expect(page).toContain("Recursos equivalentes");
    expect(page).toContain("Cliente Fundador");
    expect(platform).toContain("Equivalência funcional");
  });

  it("keeps the SaaS PIX ledger server-only with RLS", () => {
    const migration = read("supabase/sql/158_subscription_pix_billing_v1.sql");
    expect(migration).toContain("create table if not exists public.subscription_pix_charges");
    expect(migration).toContain("enable row level security");
    expect(migration).toContain("revoke all on table public.subscription_pix_charges from public,anon,authenticated");
    expect(migration).toContain("grant select,insert,update on table public.subscription_pix_charges to service_role");
  });

  it("reuses the owner Mercado Pago OAuth source without duplicating secrets", () => {
    const source = read("src/server/billing/platform-billing-source-service.ts");
    const billing = read("src/server/billing/subscription-pix-billing-service.ts");
    const migration = read("supabase/sql/167_platform_billing_mercado_pago_source.sql");
    const env = read(".env.example");
    expect(source).toContain('billing.mercado_pago.source');
    expect(source).toContain("getUsableMercadoPagoCredentials");
    expect(source).toContain('source.value.enabled !== true');
    expect(billing).toContain("PlatformBillingSourceService.credentials()");
    expect(migration).toContain("aweservicosaw@gmail.com");
    expect(migration).toContain("'enabled',false");
    expect(env).not.toContain("PEDEAQUI_BILLING_MERCADO_PAGO_ACCESS_TOKEN");
    expect(env).not.toContain("PEDEAQUI_BILLING_MERCADO_PAGO_WEBHOOK_SECRET");
  });

  it("stays off before go-live and still reconciles already-issued PIX after a pause", () => {
    const source = read("src/server/billing/platform-billing-source-service.ts");
    const service = read("src/server/billing/subscription-pix-billing-service.ts");
    expect(service).toContain("if (!source.enabled) return result");
    expect(service).toContain('.not("next_due_at", "is", null)');
    expect(service).toContain('expirationTime: PIX_EXPIRATION');
    expect(service).toContain("credentials({ requireBillingEnabled: false })");
    expect(source).toContain("webhookSecret()");
    expect(source).toContain("requireBillingEnabled: false");
  });

  it("routes the existing owner Mercado Pago webhook to subscriptions without breaking restaurant orders", () => {
    const service = read("src/server/payments/mercado-pago-webhook-service.ts");
    const route = read("src/app/api/webhooks/payments/mercado-pago/[storeId]/route.ts");
    expect(service).toContain("PlatformBillingSourceService.configuration()");
    expect(service).toContain("SubscriptionPixBillingService.reconcileByProviderResource(dataId)");
    expect(service).toContain("billingSource.sourceStoreId === input.storeId");
    expect(service).toContain("OrderPixService.reconcile(credentials.store_id, dataId)");
    expect(service).toContain("subscriptionBilling: true");
    expect(service).toContain("subscriptionBilling: false");
    expect(route).toContain("if (!result.subscriptionBilling) scheduleOrderWhatsAppNotifications");
  });

  it("requires an explicit go-live phrase and delegates provider plus scheduler checks to one atomic RPC", () => {
    const actions = read("src/features/platform-governance/actions.ts");
    const settings = read("src/app/platform/configuracoes/page.tsx");
    const secretMigration = read("supabase/sql/168_subscription_renewal_job_secret.sql");
    const schedulerMigration = read("supabase/sql/169_subscription_renewal_scheduler.sql");
    expect(actions).toContain("ATIVAR COBRANCA");
    expect(actions).toContain("PAUSAR COBRANCA");
    expect(actions).toContain('admin.rpc("platform_subscription_billing_set_enabled_internal"');
    expect(actions).not.toContain("process.env.CRON_SECRET");
    expect(actions).toContain("A fonte Mercado Pago da plataforma usa o controle financeiro dedicado");
    expect(settings).toContain("setPlatformBillingEnabledAction");
    expect(settings).toContain("Ativar cobrança automática");
    expect(secretMigration).toContain("pedeaqui_internal_subscription_renewals_token");
    expect(secretMigration).toContain("extensions.gen_random_bytes(32)");
    expect(schedulerMigration).toContain("platform_subscription_billing_set_enabled_internal");
    expect(schedulerMigration).toContain("billing Mercado Pago source is not healthy");
    expect(schedulerMigration).toContain("cron.alter_job");
  });

  it("protects renewal and webhook execution", () => {
    const job = read("src/app/api/internal/subscription-renewals/route.ts");
    const auth = read("src/server/jobs/internal-job-auth.ts");
    const webhook = read("src/app/api/webhooks/subscription-billing/mercado-pago/route.ts");
    expect(job).toContain('authorizeInternalJob(request, "subscription_renewals")');
    expect(auth).toContain('"subscription_renewals"');
    expect(webhook).toContain("validateMercadoPagoWebhookSignature");
    expect(webhook).toContain("await SubscriptionPixBillingService.webhookSecret()");
    expect(webhook).toContain("RESOURCE_ID");
    expect(webhook).toContain("reconcileByProviderResource");
  });

  it("confirms paid renewals atomically and idempotently", () => {
    const service = read("src/server/billing/subscription-pix-billing-service.ts");
    const migration = read("supabase/sql/160_subscription_pix_confirmation_atomic.sql");
    expect(service).toContain('admin.rpc("subscription_invoice_save_internal"');
    expect(service).toContain('admin.rpc("subscription_pix_charge_confirm_internal"');
    expect(migration).toContain("subscription_payment_record_internal");
    expect(migration).toContain("if v_charge.status='paid'");
    expect(migration).toContain("'idempotent',true");
    expect(migration).toContain("platform.subscription_pix_paid");
    expect(migration).toContain("next_due_at=v_next_due_at");
  });

  it("schedules only one daily renewal cycle in Supabase and keeps Vercel free of cron jobs", () => {
    const vercel = read("vercel.json");
    const schedulerMigration = read("supabase/sql/169_subscription_renewal_scheduler.sql");
    expect(vercel).not.toContain('"crons"');
    expect(schedulerMigration).toContain("pedeaqui-subscription-renewals");
    expect(schedulerMigration).toContain("'0 8 * * *'");
    expect(schedulerMigration).toContain("/api/internal/subscription-renewals");
    expect(schedulerMigration).toContain("active => false");
  });
});
