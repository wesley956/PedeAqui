import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe,expect,it } from "vitest";

function read(path:string){ return readFileSync(join(process.cwd(),path),"utf8").toLowerCase(); }
const core=read("supabase/sql/81_plans_scale_core.sql");
const usage=read("supabase/sql/82_entitlements_usage.sql");
const service=read("src/server/platform/entitlement-service.ts");
const permissions=read("src/server/access/permissions.ts");

describe("plans and subscriptions foundation",()=>{
  it("creates the blueprint plan entities",()=>{ for(const table of ["public.plans","public.features","public.plan_features","public.organization_subscriptions"]) expect(core).toContain(`create table ${table}`); });
  it("allows only one current subscription per organization",()=>{ expect(core).toContain("organization_subscriptions_current_idx"); expect(core).toContain("where status in ('trialing','active','past_due')"); });
  it("keeps subscription history and usage ledger immutable",()=>{ expect(core).toContain("subscription_history_immutable"); expect(core).toContain("feature_usage_events_immutable"); expect(core).toContain("usage ledger is immutable"); });
  it("keeps plan data server-only",()=>{ expect(core).toContain("from anon,authenticated"); expect(core).toContain("to service_role"); expect(core).toContain("organization_subscriptions_browser_deny"); });
});

describe("entitlement and limit enforcement",()=>{
  it("resolves subscription status and feature limit centrally",()=>{ expect(usage).toContain("private.organization_entitlement"); expect(usage).toContain("organization_entitlement_internal"); expect(usage).toContain("plan_features"); expect(usage).toContain("limit_value"); });
  it("serializes usage and enforces limit in the database",()=>{ expect(usage).toContain("pg_advisory_xact_lock"); expect(usage).toContain("feature usage limit exceeded"); expect(usage).toContain("for update"); });
  it("recognizes idempotency before consuming again",()=>{ const existing=usage.indexOf("select * into v_existing from public.feature_usage_events"); const lock=usage.indexOf("pg_advisory_xact_lock"); expect(existing).toBeGreaterThanOrEqual(0); expect(lock).toBeGreaterThan(existing); });
  it("separates RBAC from entitlement in the application service",()=>{ const requireMethod=service.slice(service.indexOf("static async require"),service.indexOf("static async consume")); expect(requireMethod.indexOf("authorize(")).toBeLessThan(requireMethod.indexOf("load(")); expect(requireMethod).toContain("entitlement.enabled"); });
  it("consumes usage only after entitlement requirement",()=>{ const consume=service.slice(service.indexOf("static async consume")); expect(consume.indexOf("this.require(")).toBeLessThan(consume.indexOf("createadminclient()")); expect(consume).toContain("feature_usage_consume_internal"); });
});

describe("scale permissions and branding foundation",()=>{
  it("defines plan/branding/scale permissions",()=>{ for(const key of ["subscription.view","branding.view","branding.manage","scale.view","scale.manage"]) expect(permissions).toContain(key); });
  it("creates organization branding with safe defaults",()=>{ expect(core).toContain("create table public.organization_branding"); expect(core).toContain("white_label_enabled boolean not null default false"); expect(core).toContain("hide_pedeaqui_branding boolean not null default false"); expect(core).toContain("primary_color"); });
});
