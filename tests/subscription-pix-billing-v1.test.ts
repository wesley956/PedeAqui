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

  it("schedules only one daily renewal cycle", () => {
    const vercel = read("vercel.json");
    expect(vercel).toContain("/api/internal/subscription-renewals");
    expect(vercel).toContain('"schedule": "0 8 * * *"');
  });
});
