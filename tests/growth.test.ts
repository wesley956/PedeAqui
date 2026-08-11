import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { projectPosGrowth, type PosCoupon, type PosCustomer, type PosGrowthSettings } from "@/features/pdv/model";

function sql(name: string) { return readFileSync(join(process.cwd(), `supabase/sql/${name}`), "utf8").toLowerCase(); }
const core = sql("38_growth_core.sql");
const operations = sql("39_growth_operations.sql");
const pdv = sql("40_growth_pdv.sql");
const campaigns = sql("41_growth_campaigns_automations.sql");
const cartRefresh = sql("42_growth_cart_refresh.sql");
const privateGrants = sql("43_growth_private_execution_grants.sql");

describe("growth database contracts", () => {
  it("defines explicit growth permissions", () => {
    expect(core).toContain("'growth.view'");
    expect(core).toContain("'growth.manage'");
    expect(core).toContain("'growth.campaigns'");
  });

  it("creates every growth table with RLS", () => {
    for (const table of [
      "store_growth_settings", "coupons", "cashback_accounts", "cashback_transactions", "loyalty_accounts", "loyalty_transactions",
    ]) {
      expect(core).toContain(`public.${table}`);
      expect(core).toContain(`alter table public.${table} enable row level security`);
    }
    for (const table of ["coupon_redemptions"]) expect(operations).toContain(`alter table public.${table} enable row level security`);
    for (const table of ["customer_segments", "campaigns", "campaign_recipients", "automation_rules", "automation_runs"]) {
      expect(campaigns).toContain(`public.${table}`);
      expect(campaigns).toContain(`alter table public.${table} enable row level security`);
    }
  });

  it("keeps reward balances non-negative, signed and idempotent", () => {
    expect(core).toContain("balance_cents >= 0");
    expect(core).toContain("balance_points >= 0");
    expect(core).toContain("cashback_transactions_sign_check");
    expect(core).toContain("loyalty_transactions_sign_check");
    expect(core).toContain("cashback_transactions_org_idem_unique");
    expect(core).toContain("loyalty_transactions_org_idem_unique");
  });

  it("locks reward accounts and coupons before consuming limited value", () => {
    expect(operations).toMatch(/cashback_accounts[\s\S]{0,500}for update/);
    expect(operations).toMatch(/loyalty_accounts[\s\S]{0,500}for update/);
    expect(operations).toMatch(/public\.coupons[\s\S]{0,700}for update/);
    expect(operations).toContain("insufficient cashback balance");
    expect(operations).toContain("insufficient loyalty balance");
  });

  it("integrates growth into checkout before order creation and handles zero total", () => {
    expect(operations).toContain("private.resolve_growth_benefits");
    expect(operations).toContain("benefits changed; review checkout again");
    expect(operations).toContain("coupon_discount_cents");
    expect(operations).toContain("cashback_discount_cents");
    expect(operations).toContain("loyalty_redeemed_points");
    expect(operations).toMatch(/case\s+when\s+v_total\s*=\s*0\s+then\s+'paid'\s+else\s+'pending'\s+end/);
    expect(operations).toMatch(/if\s+new\.total_cents\s*=\s*0/);
  });

  it("uses compensating transactions when a discounted order is rejected or canceled", () => {
    expect(operations).toContain("'reversal'");
    expect(operations).toContain(":cashback:redeem:reversal");
    expect(operations).toContain(":loyalty:redeem:reversal");
    expect(operations).toContain("status='released'");
  });

  it("consumes order.completed without coupling OrderService", () => {
    expect(operations).toContain("orders_growth_after_completion");
    expect(operations).toContain("order:'||new.id::text||':cashback:earn");
    expect(operations).toContain("order:'||new.id::text||':loyalty:earn");
  });

  it("keeps the old PDV RPC compatible while routing new sales through growth", () => {
    expect(pdv).toContain("pdv_create_order_growth_internal");
    expect(pdv).toContain("select public.pdv_create_order_growth_internal");
    expect(pdv).toContain("payment total does not match discounted order total");
    expect(pdv).toContain("zero-total pdv sale");
    expect(pdv).toContain("grant execute on function public.pdv_create_order_growth_internal");
  });

  it("models dynamic segments, campaign snapshots and idempotent automations", () => {
    expect(campaigns).toContain("growth_segment_customers_internal");
    expect(campaigns).toContain("growth_prepare_campaign_internal");
    expect(campaigns).toContain("campaign_recipients_campaign_customer_unique");
    expect(campaigns).toContain("automation_runs_org_idem_unique");
    expect(campaigns).toContain("process_order_completed_automations");
    expect(campaigns).toContain("growth_run_scheduled_automations_internal");
  });

  it("revalidates or clears stale cart benefits after repricing", () => {
    expect(cartRefresh).toContain("growth_refresh_cart_benefits_internal");
    expect(cartRefresh).toContain("private.resolve_growth_benefits");
    expect(cartRefresh).toContain("exception when others");
    expect(cartRefresh).toContain("coupon_id=null");
  });

  it("does not grant browser roles direct mutation of growth tables or internal RPCs", () => {
    const all = [core, operations, pdv, campaigns, cartRefresh, privateGrants].join("\n");
    expect(all).not.toMatch(/grant\s+(insert|update|delete)[^;]*to\s+authenticated/);
    expect(all).not.toMatch(/grant\s+execute[^;]*to\s+(anon|authenticated)/);
    expect(all).toContain("security invoker");
  });

  it("grants only the backend the private helper chain required by SECURITY INVOKER RPCs", () => {
    expect(privateGrants).toContain("grant usage on schema private to service_role");
    expect(privateGrants).toMatch(/grant\s+execute\s+on\s+function\s+private\.resolve_growth_benefits[\s\S]*to\s+service_role/);
    expect(privateGrants).toMatch(/grant\s+execute\s+on\s+function\s+private\.post_cashback_transaction[\s\S]*to\s+service_role/);
    expect(privateGrants).toMatch(/grant\s+execute\s+on\s+function\s+private\.execute_growth_automation[\s\S]*to\s+service_role/);
    expect(privateGrants).toContain("from anon,authenticated");
  });
});

describe("PDV growth projection", () => {
  const coupon: PosCoupon = {
    id: "60000000-0000-0000-0000-000000000001",
    code: "VOLTA20",
    name: "Volta 20",
    discountType: "percentage",
    fixedDiscountCents: null,
    percentageBps: 2000,
    maxDiscountCents: 2000,
    minimumOrderCents: 5000,
  };
  const customer: PosCustomer = {
    id: "40000000-0000-0000-0000-000000000001",
    name: "Cliente",
    phone: null,
    email: null,
    cashbackBalanceCents: 3000,
    loyaltyBalancePoints: 500,
  };
  const settings: PosGrowthSettings = { cashbackEnabled: true, loyaltyEnabled: true, loyaltyRedeemCentsPerPoint: 10 };

  it("projects coupon + cashback + points in the same order as the database", () => {
    const result = projectPosGrowth({ subtotalCents: 10000, couponCode: "volta20", coupons: [coupon], customer, settings, cashbackRedeemCents: 1000, loyaltyRedeemPoints: 100 });
    expect(result).toMatchObject({ valid: true, couponDiscountCents: 2000, cashbackDiscountCents: 1000, loyaltyDiscountCents: 1000, discountCents: 4000, totalCents: 6000 });
  });

  it("rejects balance and merchandise over-redemption in the client projection", () => {
    expect(projectPosGrowth({ subtotalCents: 10000, couponCode: "", coupons: [coupon], customer, settings, cashbackRedeemCents: 3001, loyaltyRedeemPoints: 0 }).valid).toBe(false);
    expect(projectPosGrowth({ subtotalCents: 1000, couponCode: "", coupons: [coupon], customer, settings, cashbackRedeemCents: 0, loyaltyRedeemPoints: 200 }).valid).toBe(false);
  });

  it("supports a coupon that reduces merchandise total to zero", () => {
    const free: PosCoupon = { ...coupon, code: "FREE", discountType: "fixed", fixedDiscountCents: 10000, percentageBps: null, maxDiscountCents: null, minimumOrderCents: 0 };
    const result = projectPosGrowth({ subtotalCents: 10000, couponCode: "FREE", coupons: [free], customer: null, settings, cashbackRedeemCents: 0, loyaltyRedeemPoints: 0 });
    expect(result).toMatchObject({ valid: true, discountCents: 10000, totalCents: 0 });
  });
});
