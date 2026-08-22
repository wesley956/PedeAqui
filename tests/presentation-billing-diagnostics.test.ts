import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const sql = read("supabase/sql/120_platform_saas_billing.sql");
const service = read("src/server/platform/platform-commercial-billing-service.ts");
const actions = read("src/features/platform-commercial-billing/actions.ts");
const billingPage = read("src/app/platform/assinaturas/page.tsx");
const presentationPage = read("src/app/platform/apresentacao/page.tsx");
const layout = read("src/app/platform/layout.tsx");
const connectivity = read("src/components/resilience/connectivity-guard.tsx");
const loginRateSql = read("supabase/sql/122_auth_login_rate_limit.sql");
const authActions = read("src/features/auth/actions.ts");

describe("presentation resilience PA-DIAG-096–119", () => {
  it("offers a mobile presentation workspace, exact sequence and commercial answers", () => {
    expect(layout).toContain('["Apresentação", "/platform/apresentacao"]');
    expect(presentationPage).toContain("Roteiro seguro da demonstração");
    expect(presentationPage).toContain("QR Code e endereço curto");
    expect(presentationPage).toContain("Plano alternativo");
    expect(presentationPage).toContain("Respostas comerciais");
    expect(presentationPage).toContain("Pedido completo");
  });

  it("keeps the demo tenant isolated and does not put a credential in the QR", () => {
    expect(presentationPage).toContain("ensureDemo()");
    expect(presentationPage).toContain("/m/${demo.slug}");
    expect(presentationPage).toContain("sem credenciais");
    expect(presentationPage).not.toMatch(/password|service_role|access_token/i);
  });

  it("warns on connection loss and before abandoning dirty forms", () => {
    expect(connectivity).toContain('window.addEventListener("offline"');
    expect(connectivity).toContain('window.addEventListener("online"');
    expect(connectivity).toContain('window.addEventListener("beforeunload"');
    expect(connectivity).toContain('role="alert"');
    expect(connectivity).not.toContain("localStorage");
  });

  it("validates dates and money before mutations reach the service", () => {
    expect(actions).toContain("Number.isFinite(date.getTime())");
    expect(actions).toContain("Number.isFinite(value)");
    expect(service).toContain("planSaveSchema.parse");
    expect(service).toContain("adjustmentSchema.parse");
    expect(service).toContain("invoiceSchema.parse");
    expect(service).toContain("paymentSchema.parse");
  });

  it("limits repeated main-login failures without persisting email, IP or password", () => {
    expect(loginRateSql).toContain("private.auth_login_attempts");
    expect(loginRateSql).toContain("v_failures>=5");
    expect(loginRateSql).toContain("interval '15 minutes'");
    expect(loginRateSql).not.toMatch(/\b(email|ip_address|password)\b/i);
    expect(authActions).toContain('createHmac("sha256"');
    expect(authActions).toContain("auth_login_guard_internal");
    expect(authActions).toContain("auth_login_failure_internal");
    expect(authActions).toContain("too_many_attempts");
  });
});

describe("SaaS finance and founders PA-DIAG-120–145", () => {
  it("separates platform billing into purpose-built tables", () => {
    for (const table of ["plan_versions", "plan_version_features", "subscription_billing_adjustments", "subscription_invoices", "subscription_payments", "subscription_billing_notifications", "platform_financial_audit"]) {
      expect(sql).toContain(`create table public.${table}`);
      expect(sql).toContain(`alter table public.${table} enable row level security`);
      expect(sql).toContain(`create policy ${table}_browser_deny`);
    }
    expect(billingPage).toContain("não mistura vendas, caixa ou contas dos restaurantes");
  });

  it("keeps plan versions and financial audit immutable", () => {
    expect(sql).toContain("plan_versions_immutable");
    expect(sql).toContain("plan_version_features_immutable");
    expect(sql).toContain("platform_financial_audit_immutable");
    expect(sql).toContain("financial ledger is immutable");
  });

  it("supports catalog CRUD through versioned, backend-authorized actions", () => {
    expect(sql).toContain("platform_plan_save_internal");
    expect(sql).toContain("private.require_platform_super_admin");
    expect(service).toContain("savePlan");
    expect(actions).toContain("saveCommercialPlanAction");
    expect(billingPage).toContain("Criar um novo plano");
    expect(billingPage).toContain("Salvar nova versão");
    expect(billingPage).toContain("Disponível para novas vendas");
  });

  it("snapshots modules and prices so later plan edits preserve old contracts", () => {
    expect(sql).toContain("plan_version_features");
    expect(sql).toContain("organization_subscriptions_attach_plan_version");
    expect(sql).toContain("plan_version_id=v_plan.current_version_id");
    expect(billingPage).toContain("Assinaturas antigas continuam presas à versão contratada");
  });

  it("supports temporary discounts without mutating the base contract", () => {
    expect(sql).toContain("subscription_adjustment_apply_internal");
    expect(sql).toContain("subscription_adjustment_cancel_internal");
    expect(sql).toContain("ends_at > starts_at");
    expect(billingPage).toContain("Ao final, o contrato-base volta a valer automaticamente");
  });

  it("implements invoice and payment lifecycle with idempotency and due indexes", () => {
    expect(sql).toContain("subscription_invoice_save_internal");
    expect(sql).toContain("subscription_payment_record_internal");
    expect(sql).toContain("subscription_invoices_org_idem_unique");
    expect(sql).toContain("subscription_payments_org_idem_unique");
    expect(sql).toContain("subscription_invoices_due_idx");
    expect(billingPage).toContain("Criar ou atualizar uma mensalidade");
    expect(billingPage).toContain("Registrar pagamento");
  });

  it("suspends and reactivates access without deleting restaurant data", () => {
    expect(sql).toContain("subscription_access_set_internal");
    expect(sql).not.toMatch(/delete from public\.(stores|products|orders|store_menu_settings)/i);
    expect(billingPage).toContain("nunca apaga cardápio, pedidos ou configurações");
  });

  it("queues panel and WhatsApp reminders without storing message credentials", () => {
    expect(sql).toContain("subscription_billing_notifications");
    expect(sql).toContain("'whatsapp','due_soon'");
    expect(sql).toContain("'panel','overdue'");
    expect(sql).not.toMatch(/whatsapp.*(token|secret)/i);
  });

  it("enforces exactly three founder slots in the database", () => {
    expect(sql).toContain("organization_subscriptions_founder_slot_unique");
    expect(sql).toContain("founder_slot between 1 and 3");
    expect(sql).toContain("generate_series(1,3)");
    expect(sql).toContain("founders plan capacity reached");
    expect(sql).toContain("pg_advisory_xact_lock");
  });

  it("seeds the R$ 79,90 lifetime founders plan", () => {
    expect(sql).toContain("values('founders','Fundadores'");
    expect(sql).toContain("monthly_price_cents=7990");
    expect(sql).toContain("agreed_price_cents=7990");
    expect(sql).toContain("price_locked=true");
    expect(billingPage).toContain("posições vitalícias usadas");
  });

  it("keeps every mutation server-side and revalidates commercial views", () => {
    for (const rpc of ["platform_plan_save_internal", "subscription_adjustment_apply_internal", "subscription_invoice_save_internal", "subscription_payment_record_internal", "subscription_access_set_internal", "subscription_founder_assign_internal"]) expect(service).toContain(`admin.rpc("${rpc}"`);
    expect(service).toContain('access.role !== "super_admin"');
    expect(actions).toContain('revalidatePath("/platform/assinaturas")');
  });
});
