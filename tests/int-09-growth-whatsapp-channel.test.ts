import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { couponInputSchema } from "@/server/growth/schemas";

const readRepoFile = (path: string) => readFileSync(path, "utf8");

const benefitsAdapter = readRepoFile("src/server/growth/customer-benefits.ts");
const greetingService = readRepoFile("src/server/conversations/greeting-service.ts");
const directOrderOrchestrator = readRepoFile("src/server/conversations/whatsapp-direct-order-orchestrator.ts");
const aiTools = readRepoFile("src/server/conversations/ai-tools.ts");
const growthService = readRepoFile("src/server/growth/growth-service.ts");
const migration = readRepoFile("supabase/migrations/20260915071500_int09_growth_whatsapp_channel.sql");

function couponInput(whatsappEnabled?: boolean) {
  return {
    code: whatsappEnabled ? "INT09WA" : "INT09",
    name: whatsappEnabled ? "INT-09 WhatsApp coupon" : "INT-09 canonical coupon",
    discountType: "percentage" as const,
    fixedDiscountCents: null,
    percentageBps: 1000,
    maxDiscountCents: null,
    minimumOrderCents: 0,
    usageLimitTotal: null,
    usageLimitPerCustomer: null,
    validUntil: null,
    ...(whatsappEnabled === undefined ? {} : { whatsappEnabled }),
  };
}

describe("INT-09 canonical Growth channel contracts", () => {
  it("requires an explicit canonical channel and forwards it to the RPC", () => {
    expect(benefitsAdapter).toContain('export type CustomerBenefitChannel = "digital_menu" | "whatsapp"');
    expect(benefitsAdapter).toContain("channel: CustomerBenefitChannel");
    expect(benefitsAdapter).toContain("p_channel: input.channel");
    expect(benefitsAdapter).not.toContain('p_channel: "digital_menu"');
    expect(benefitsAdapter).not.toContain('p_channel: "whatsapp"');
  });

  it("marks every WhatsApp benefit caller with the real whatsapp channel", () => {
    expect(greetingService).toMatch(/loadCustomerBenefits\(\{[\s\S]*?channel: "whatsapp",[\s\S]*?\}\)/);
    expect(directOrderOrchestrator).toMatch(/loadCustomerBenefits\(\{[\s\S]*?channel: "whatsapp",[\s\S]*?\}\)/);
    expect(aiTools).toMatch(/loadCustomerBenefits\(\{[\s\S]*?channel: "whatsapp",[\s\S]*?\}\)/);
  });

  it("keeps WhatsApp coupon eligibility opt-in by default", () => {
    const parsed = couponInputSchema.parse(couponInput());
    expect(parsed.whatsappEnabled).toBe(false);
  });

  it("allows an operator to opt a new coupon into WhatsApp explicitly", () => {
    const parsed = couponInputSchema.parse(couponInput(true));
    expect(parsed.whatsappEnabled).toBe(true);
    expect(growthService).toContain('...(values.whatsappEnabled ? ["whatsapp"] : [])');
  });

  it("does not silently map digital_menu coupons to whatsapp", () => {
    expect(growthService).toContain('allowed_channels: ["digital_menu", ...(values.whatsappEnabled ? ["whatsapp"] : []), "pdv", "counter", "waiter", "table_qr", "manual"]');
    expect(growthService).not.toContain('["digital_menu", "whatsapp", "pdv"');
  });

  it("accepts whatsapp in the canonical benefits RPC while keeping channel filtering", () => {
    expect(migration).toContain("'digital_menu','whatsapp','pdv','counter','waiter','table_qr','manual'");
    expect(migration).toContain("p_channel = any(c.allowed_channels)");
  });

  it("keeps the canonical checkout Growth resolver as the source of truth", () => {
    expect(migration).toContain("private.resolve_growth_benefits(");
    expect(migration).toContain("private.store_module_enabled(");
    expect(migration).toContain("private.cashback_available_balance(");
  });

  it("contains no coupon backfill and no benefit consumption in the read migration", () => {
    expect(migration).not.toMatch(/update\s+(public\.)?coupons\s+set/i);
    expect(migration).not.toMatch(/insert\s+into\s+.*(redemption|usage|ledger|transaction)/i);
    expect(migration).not.toMatch(/delete\s+from/i);
  });
});
