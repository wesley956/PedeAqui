import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { couponInputSchema } from "@/server/growth/schemas";

const readRepoFile = (path: string) => readFileSync(path, "utf8");

const benefitsAdapter = readRepoFile("src/server/growth/customer-benefits.ts");
const greetingService = readRepoFile("src/server/conversations/greeting-service.ts");
const directOrderOrchestrator = readRepoFile("src/server/conversations/whatsapp-direct-order-orchestrator.ts");
const growthService = readRepoFile("src/server/growth/growth-service.ts");
const migration = readRepoFile("supabase/migrations/20260915071500_int09_growth_whatsapp_channel.sql");

describe("INT-09 canonical Growth channel contracts", () => {
  it("requires an explicit canonical channel and forwards it to the RPC", () => {
    expect(benefitsAdapter).toContain('export type CustomerBenefitChannel = "digital_menu" | "whatsapp"');
    expect(benefitsAdapter).toContain("channel: CustomerBenefitChannel");
    expect(benefitsAdapter).toContain("p_channel: input.channel");
    expect(benefitsAdapter).not.toContain('p_channel: "digital_menu"');
    expect(benefitsAdapter).not.toContain('p_channel: "whatsapp"');
  });

  it("marks both WhatsApp benefit callers with the real whatsapp channel", () => {
    expect(greetingService).toMatch(/loadCustomerBenefits\(\{[\s\S]*?channel: "whatsapp",[\s\S]*?\}\)/);
    expect(directOrderOrchestrator).toMatch(/loadCustomerBenefits\(\{[\s\S]*?channel: "whatsapp",[\s\S]*?\}\)/);
  });

  it("keeps WhatsApp coupon eligibility opt-in by default", () => {
    const parsed = couponInputSchema.parse({
      code: "INT09",
      name: "INT-09 canonical coupon",
      discount_type: "percentage",
      percentage_percent: 10,
    });

    expect(parsed.whatsappEnabled).toBe(false);
  });

  it("allows an operator to opt a new coupon into WhatsApp explicitly", () => {
    const parsed = couponInputSchema.parse({
      code: "INT09WA",
      name: "INT-09 WhatsApp coupon",
      discount_type: "percentage",
      percentage_percent: 10,
      whatsappEnabled: true,
    });

    expect(parsed.whatsappEnabled).toBe(true);
    expect(growthService).toContain('if (input.whatsappEnabled)');
    expect(growthService).toContain('allowedChannels.push("whatsapp")');
  });

  it("does not silently add whatsapp to the base channels for legacy-compatible coupon creation", () => {
    expect(growthService).toContain('const allowedChannels = ["digital_menu", "pdv", "counter", "waiter", "table_qr", "manual"]');
    expect(growthService).not.toContain('const allowedChannels = ["digital_menu", "whatsapp"');
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
