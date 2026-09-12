import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildCustomerBenefitsMessage, resolveWhatsAppBotIntent } from "@/server/conversations/bot-menu";
import type { CustomerBenefits } from "@/server/growth/customer-benefits";

const read = (path: string) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/20260912102500_growth_bot_relationships_1022.sql");
const canonical = read("supabase/sql/214_growth_bot_relationships.sql");
const greeting = read("src/server/conversations/greeting-service.ts");
const directOrder = read("src/server/conversations/whatsapp-direct-order-orchestrator.ts");
const aiTools = read("src/server/conversations/ai-tools.ts");
const route = read("src/app/api/internal/campaign-messages/route.ts");
const worker = read("src/server/growth/campaign-worker.ts");

const benefits: CustomerBenefits = {
  identified: true, available: true, cashbackEnabled: true, cashbackBalanceCents: 1250,
  loyaltyEnabled: true, loyaltyBalancePoints: 80, loyaltyRedeemCentsPerPoint: 5,
  coupons: [{ id: "coupon", code: "VOLTA10", name: "Volta", discount_type: "percentage", fixed_discount_cents: null, percentage_bps: 1000, max_discount_cents: 2000, minimum_order_cents: 3000, valid_until: "2026-12-31T23:59:59Z", eligible_for_subtotal: false, discount_cents: null }],
  promotions: [{ productName: "X-Salada", promotionalPriceCents: 1990, label: "Oferta" }], evaluatedAt: "2026-09-12T10:00:00Z",
};

describe("growth + WhatsApp relationships [1022]", () => {
  it("keeps canonical SQL and migration equal", () => expect(migration).toBe(canonical));

  it("recognizes natural benefit questions and disputes", () => {
    expect(resolveWhatsAppBotIntent("quanto tenho de cashback?", "menu")).toBe("cashback");
    expect(resolveWhatsAppBotIntent("quantos pontos tenho?", "menu")).toBe("points");
    expect(resolveWhatsAppBotIntent("tem cupom para mim?", "menu")).toBe("coupons");
    expect(resolveWhatsAppBotIntent("qual promoção está ativa?", "menu")).toBe("promotions");
    expect(resolveWhatsAppBotIntent("meu saldo está errado", "menu")).toBe("benefit_handoff");
  });

  it("reports real values with checkout caveat and never claims application", () => {
    expect(buildCustomerBenefitsMessage("benefits", benefits, "https://pede.test/m/loja")).toContain("R$ 12,50");
    expect(buildCustomerBenefitsMessage("points", benefits, "https://pede.test/m/loja")).toContain("80");
    expect(buildCustomerBenefitsMessage("coupons", benefits, "https://pede.test/m/loja")).toContain("VOLTA10");
    expect(buildCustomerBenefitsMessage("promotions", benefits, "https://pede.test/m/loja")).toContain("X-Salada");
    expect(buildCustomerBenefitsMessage("benefits", benefits, "https://pede.test/m/loja")).toContain("aplique com segurança no checkout");
    expect(directOrder).toContain("Não apliquei nem consumi nada no pedido por aqui");
  });

  it("requires a conversation-linked customer and tenant/store boundaries", () => {
    const message = buildCustomerBenefitsMessage("benefits", { ...benefits, identified: false, available: false }, "https://pede.test/m/loja");
    expect(message).toContain("vincular este WhatsApp");
    expect(greeting).toContain("customerId: contact.customer_id");
    expect(migration).toContain("id=p_customer_id and organization_id=v_store.organization_id");
    expect(migration).toContain("ct.id=p_contact_id");
    expect(migration).toContain("ct.store_id=v_store.id and ct.customer_id=v_customer.id");
    expect(migration).toContain("customer unavailable for store organization");
  });

  it("delegates coupon truth to the checkout resolver", () => {
    expect(migration).toContain("private.resolve_growth_benefits(");
    expect(migration).toContain("p_channel=any(c.allowed_channels)");
    expect(migration).toContain("grant execute on function public.growth_customer_benefits_internal");
    expect(migration).toContain("to service_role");
    expect(migration).toContain("from public,anon,authenticated");
  });

  it("excludes expired cashback in both bot and checkout", () => {
    expect(migration).toContain("private.cashback_available_balance");
    expect(migration).toContain("expires_at<=p_at");
    expect(migration).toContain("v_available_cashback<p_cashback_requested_cents");
    expect(migration).toContain("growth_expire_due_cashback_internal");
    expect(route.indexOf("growth_expire_due_cashback_internal")).toBeLessThan(route.indexOf("growth_run_due_relationship_automations_internal"));
  });

  it("classifies campaign automation as marketing and reuses consent plus anti-spam queue", () => {
    expect(migration).toContain("'message_class','marketing'");
    expect(migration).toContain("marketing_consent_required");
    expect(migration).toContain("store_customer_relationship_required");
    expect(migration).toContain("public.campaign_occurrences");
    expect(migration).toContain("'queued'");
    expect(migration).toContain("approved WhatsApp template is required");
    expect(worker).toContain("template_name_snapshot");
    expect(worker).toContain("content_snapshot");
    expect(worker).toContain("delivery.templateName");
    expect(migration).toContain("not exists(select 1 from public.automation_rules");
  });

  it("makes scheduled relationship automations safe and automatic", () => {
    expect(migration).toContain(":birthday:");
    expect(migration).toContain(":inactive-after:");
    expect(migration).toContain("on conflict(organization_id,idempotency_key) do nothing");
    expect(route.indexOf("growth_run_due_relationship_automations_internal")).toBeLessThan(route.indexOf("growth_schedule_due_campaigns_internal"));
    expect(migration).toContain("relationship_automations_checked_at nulls first");
    expect(migration).toContain("pg_try_advisory_xact_lock");
  });

  it("exposes the deterministic benefit query to the existing AI tool boundary", () => {
    expect(aiTools).toContain('"customer.benefits"');
    expect(aiTools).toContain("loadCustomerBenefits");
    expect(aiTools).toContain("growth_customer_available_balances_internal");
    expect(aiTools).not.toContain("generateText(");
  });
});
