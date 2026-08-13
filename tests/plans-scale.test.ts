import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe,expect,it } from "vitest";

function read(path:string){ return readFileSync(join(process.cwd(),path),"utf8").toLowerCase(); }
const core=read("supabase/sql/81_plans_scale_core.sql");
const usage=read("supabase/sql/82_entitlements_usage.sql");
const lifecycle=read("supabase/sql/83_subscription_lifecycle_billing.sql");
const scaleCore=read("supabase/sql/84_platform_branding_domains_scale.sql");
const reporting=read("supabase/sql/85_scale_reporting_marketplace.sql");
const guards=read("supabase/sql/86_scale_entitlement_guards.sql");
const domainHardening=read("supabase/sql/87_domain_token_hardening.sql");
const entitlementService=read("src/server/platform/entitlement-service.ts");
const scaleService=read("src/server/platform/scale-service.ts");
const billingService=read("src/server/platform/billing-webhook-service.ts");
const billingRegistry=read("src/server/platform/billing-provider-registry.ts");
const billingRoute=read("src/app/api/webhooks/billing/[providerKey]/route.ts");
const brandingRead=read("src/server/platform/branding-read-service.ts");
const domainVerification=read("src/server/platform/domain-verification-service.ts");
const platformService=read("src/server/platform/platform-admin-service.ts");
const shell=read("src/components/layout/app-shell.tsx");
const permissions=read("src/server/access/permissions.ts");

describe("plans and subscriptions foundation",()=>{
  it("creates the blueprint plan entities",()=>{ for(const table of ["public.plans","public.features","public.plan_features","public.organization_subscriptions"]) expect(core).toContain(`create table ${table}`); });
  it("allows only one current subscription per organization",()=>{ expect(core).toContain("organization_subscriptions_current_idx"); expect(core).toContain("where status in ('trialing','active','past_due')"); });
  it("keeps subscription history and usage ledger immutable",()=>{ expect(core).toContain("subscription_history_immutable"); expect(core).toContain("feature_usage_events_immutable"); expect(core).toContain("usage ledger is immutable"); });
  it("keeps plan data server-only",()=>{ expect(core).toContain("from anon,authenticated"); expect(core).toContain("to service_role"); expect(core).toContain("organization_subscriptions_browser_deny"); });
});

describe("entitlement and limit enforcement",()=>{
  it("resolves subscription status and feature limit centrally",()=>{ expect(usage).toContain("private.organization_entitlement"); expect(usage).toContain("organization_entitlement_internal"); expect(usage).toContain("plan_features"); expect(usage).toContain("limit_value"); });
  it("serializes periodic usage and enforces limit in the database",()=>{ expect(usage).toContain("pg_advisory_xact_lock"); expect(usage).toContain("feature usage limit exceeded"); expect(usage).toContain("for update"); });
  it("recognizes idempotency before consuming again",()=>{ const existing=usage.indexOf("select * into v_existing from public.feature_usage_events"); const lock=usage.indexOf("pg_advisory_xact_lock"); expect(existing).toBeGreaterThanOrEqual(0); expect(lock).toBeGreaterThan(existing); });
  it("separates RBAC from entitlement in the application service",()=>{ const requireMethod=entitlementService.slice(entitlementService.indexOf("static async require"),entitlementService.indexOf("static async consume")); expect(requireMethod.indexOf("authorize(")).toBeLessThan(requireMethod.indexOf("load(")); expect(requireMethod).toContain("entitlement.enabled"); });
  it("uses real concurrent resource counts for domains instead of monthly usage",()=>{ expect(guards).toContain("pg_advisory_xact_lock"); expect(guards).toContain("select count(*) into v_count from public.organization_domains"); expect(guards).toContain("custom domain limit exceeded"); expect(guards).not.toContain("feature_usage_consume_internal"); });
});

describe("subscription lifecycle and billing",()=>{
  it("has an explicit subscription transition matrix and immutable history",()=>{ expect(lifecycle).toContain("private.subscription_can_transition"); expect(lifecycle).toContain("trialing"); expect(lifecycle).toContain("past_due"); expect(lifecycle).toContain("cancelled"); expect(lifecycle).toContain("expired"); expect(lifecycle).toContain("subscription_history"); });
  it("serializes subscription changes per organization",()=>{ expect(lifecycle).toContain("pg_advisory_xact_lock"); expect(lifecycle).toContain("subscription_apply_internal"); });
  it("rejects billing webhook replay with a different payload",()=>{ expect(lifecycle).toContain("billing webhook replay payload mismatch"); expect(lifecycle).toContain("billing_webhook_receipts_provider_event_unique"); });
  it("verifies billing signature before parsing and applying events",()=>{ expect(billingService.indexOf("provider.verifywebhook")).toBeLessThan(billingService.indexOf("provider.parsewebhook")); expect(billingService).toContain("subscription_apply_internal"); expect(billingRoute).toContain("1_000_000"); });
  it("uses an explicit adapter registry with no dynamic provider code",()=>{ expect(billingRegistry).toContain("new map<string,billingprovider>()"); expect(billingRegistry).not.toContain("import("); expect(billingRegistry).not.toContain("eval("); });
});

describe("white-label and custom domains",()=>{
  it("creates safe organization branding and requires entitlement for white-label",()=>{ expect(core).toContain("create table public.organization_branding"); expect(guards).toContain("white-label is not entitled for organization"); expect(brandingRead).toContain("branding.white_label"); });
  it("applies entitled branding through css variables with PedeAqui fallback",()=>{ expect(shell).toContain("--accent"); expect(shell).toContain("--accent-strong"); expect(shell).toContain("tecnologia pedeaqui"); expect(brandingRead).toContain("productname:\"pedeaqui\""); });
  it("verifies ownership with DNS TXT under a fixed prefix",()=>{ expect(domainVerification).toContain("resolvetxt"); expect(domainVerification).toContain("_pedeaqui.${domain.hostname}"); expect(domainVerification).toContain("pedeaqui-verification="); });
  it("qualifies the pgcrypto token generator under an empty search_path",()=>{ expect(domainHardening).toContain("extensions.gen_random_bytes(18)"); expect(domainHardening).toContain("set search_path=''"); });
  it("resolves only verified hostnames server-side",()=>{ expect(scaleCore).toContain("resolve_verified_domain_internal"); expect(scaleCore).toContain("status='verified'"); });
});

describe("multiunit scale and marketplace",()=>{
  it("keeps franchise membership inside the same organization",()=>{ expect(scaleCore).toContain("franchise_group_stores_group_fk"); expect(scaleCore).toContain("franchise_group_stores_store_fk"); expect(guards).toContain("store outside organization"); });
  it("centralizes purchasing needs without creating global inventory",()=>{ expect(reporting).toContain("central_purchase_needs_internal"); expect(reporting).toContain("inventory_item_stores"); expect(reporting).toContain("inventory_balances"); expect(reporting).not.toContain("create table public.central_inventory"); });
  it("builds BI from orders and the existing finance report",()=>{ expect(reporting).toContain("multiunit_bi_internal"); expect(reporting).toContain("public.orders"); expect(reporting).toContain("financial_report_internal"); expect(reporting).not.toContain("create table public.analytics"); });
  it("installs only adapters published in the catalog",()=>{ expect(guards).toContain("integration_catalog"); expect(guards).toContain("integration adapter not found"); expect(guards).toContain("billing adapters are platform-managed"); expect(scaleService).toContain("install_catalog_integration_internal"); });
});

describe("platform isolation and permissions",()=>{
  it("defines plan/branding/scale permissions",()=>{ for(const key of ["subscription.view","branding.view","branding.manage","scale.view","scale.manage"]) expect(permissions).toContain(key); });
  it("requires explicit platform_admins membership",()=>{ expect(scaleCore).toContain("create table public.platform_admins"); expect(platformService).toContain("platform_admin_check_internal"); expect(platformService).toContain("platform admin required"); });
  it("keeps platform console queries away from tenant orders/customers/finance",()=>{ expect(platformService).not.toContain("from(\"orders\")"); expect(platformService).not.toContain("from(\"customers\")"); expect(platformService).not.toContain("from(\"financial_transactions\")"); });
});
