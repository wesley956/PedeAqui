import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const sqlDir = path.join(root, "supabase/sql");
const prefix = (name: string) => Number(name.match(/^(\d+)_/)?.[1]);
const files = fs.readdirSync(sqlDir).filter((name) => name.endsWith(".sql")).sort((a, b) => prefix(a) - prefix(b) || a.localeCompare(b));
const prefixes = files.map(prefix);
function read(relativePath: string) { return fs.readFileSync(path.join(root, relativePath), "utf8"); }
function baselineMigrations() {
  const base = JSON.parse(read("supabase/production-migrations.json")) as { migrations: [string, string][] };
  const tailPath = path.join(root, "supabase/production-migrations-tail.json");
  const tail = fs.existsSync(tailPath) ? JSON.parse(fs.readFileSync(tailPath, "utf8")) as { migrations: [string, string][] } : { migrations: [] as [string, string][] };
  return [...base.migrations, ...tail.migrations];
}

describe("canonical Supabase SQL history", () => {
  it("keeps historical numbering anomalies explicit instead of rewriting applied history", () => {
    const counts = new Map<number, number>(); for (const value of prefixes) counts.set(value, (counts.get(value) ?? 0) + 1);
    const max = Math.max(...prefixes); const missing = Array.from({ length: max }, (_, index) => index + 1).filter((value) => !counts.has(value));
    const duplicates = [...counts.entries()].filter(([, count]) => count > 1).map(([value]) => value);
    expect(duplicates).toEqual([14]); expect(missing).toEqual([17]); expect(files).toContain("14_cart.sql"); expect(files).toContain("14_delivery_fk_indexes.sql");
  });

  it("preserves historical migrations and advances only by append", () => {
    const migrations = baselineMigrations();
    const lastMigration = migrations.at(-1);
    if (!lastMigration) throw new Error("baseline precisa conter migrations");
    const maxPrefix = Math.max(...prefixes);
    expect(files.at(-1)).toBe(`${maxPrefix}_${lastMigration[1]}.sql`);
    expect(files).toContain("133_driver_history_restaurant_control.sql");
    for (const file of [
      "90_onboarding_role_permission_conflict_hotfix.sql","91_customer_recognition.sql","92_whatsapp_greeting.sql","93_printing_private_execution_grants.sql","94_finance_effect_sign_integer_compat_hotfix.sql","95_public_menu_anon_security_definer.sql","96_platform_incidents.sql","97_order_payment_providers.sql","98_order_whatsapp_notifications.sql","99_order_whatsapp_template_support.sql","100_whatsapp_embedded_signup.sql","101_platform_commercial_onboarding.sql","102_new_user_guide.sql","103_order_completion_refund_states.sql","104_user_guides_rls_initplan_hardening.sql","105_modular_foundation.sql","106_modular_experience.sql","107_gas_segment_domain.sql","108_gas_segment_integrations.sql","109_gas_cart_reprice.sql","110_gas_segment_security_hardening.sql","111_gas_segment_fk_indexes.sql","112_delivery_driver_registration_ux.sql","113_driver_mobile_access.sql","114_driver_phone_pin_access.sql","115_team_management.sql","116_public_menu_readiness.sql","117_checkout_scheduling.sql","118_checkout_order_growth_gas_compatibility.sql","119_subscription_commercial_terms.sql","120_platform_saas_billing.sql","121_platform_saas_billing_fk_indexes.sql","122_auth_login_rate_limit.sql","123_subscription_addons_contract_changes.sql","124_client_01_operational_profile.sql","125_client_01_route_campaign_hardening.sql","126_client_01_campaign_concurrency_hardening.sql","127_client_01_campaign_provider_status.sql","128_internal_job_scheduler.sql","129_cash_payment_module_boundary.sql","130_driver_delivery_payment_confirmation.sql","131_driver_self_claim.sql","132_driver_self_claim_permission_boundary.sql","133_driver_history_restaurant_control.sql",
    ]) expect(files).toContain(file);
    const hotfix = read("supabase/sql/90_onboarding_role_permission_conflict_hotfix.sql");
    expect(hotfix.match(/on conflict do nothing/gi) ?? []).toHaveLength(8); expect(hotfix).toContain("create or replace function private.bootstrap_organization"); expect(hotfix).toContain("set search_path = ''");
  });

  it("keeps the driver registration hotfix explicit and append-only", () => {
    const hotfix = read("supabase/sql/112_delivery_driver_registration_ux.sql");
    expect(hotfix).toContain("create or replace function public.delivery_create_driver_internal");
    expect(hotfix).toContain("active,\n    on_duty");
    expect(hotfix).toContain("true,\n    true,");
  });

  it("keeps the historical email invitation flow untouched", () => {
    const access = read("supabase/sql/113_driver_mobile_access.sql");
    expect(access).toContain("create table if not exists public.driver_access_invitations");
    expect(access).toContain("create or replace function private.accept_invitation");
    expect(access).toContain("uq_drivers_store_user_active");
  });

  it("adds a dedicated one-time enrollment and brute-force guard for driver PIN access", () => {
    const access = read("supabase/sql/114_driver_phone_pin_access.sql");
    expect(access).toContain("create table if not exists public.driver_pin_access");
    expect(access).toContain("enrollment_token_hash");
    expect(access).toContain("failed_attempts");
    expect(access).toContain("locked_until");
    expect(access).toContain("interval '15 minutes'");
    expect(access).toContain("activate_driver_pin_access");
    expect(access).toContain("register_driver_pin_failure");
    expect(access).toContain("grant execute on function public.activate_driver_pin_access(text, uuid) to service_role");
  });

  it("keeps user guide RLS semantics while avoiding per-row auth init plans", () => {
    const hardening = read("supabase/sql/104_user_guides_rls_initplan_hardening.sql");
    expect(hardening).toContain("to authenticated"); expect(hardening.match(/\(select auth\.uid\(\)\)/g) ?? []).toHaveLength(4); expect(hardening).not.toMatch(/user_id\s*=\s*auth\.uid\(\)/);
  });

  it("documents why prefix 14 and missing 17 must remain unchanged", () => {
    const readme = read("supabase/README.md"); expect(readme).toContain("dois arquivos com prefixo `14`"); expect(readme).toContain("Não existe arquivo com prefixo `17`"); expect(readme).toContain("onboarding_role_permission_conflict_hotfix"); expect(readme).toContain("append-only");
  });
});
