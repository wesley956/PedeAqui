import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  appendWhatsAppBotMenu,
  buildWhatsAppBotMenu,
  resolveWhatsAppBotIntent,
} from "@/server/conversations/bot-menu";
import {
  looksLikeWhatsAppOrderItems,
  parseWhatsAppOrderItems,
} from "@/server/conversations/whatsapp-order-service";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const migration = read("supabase/migrations/20260912004000_whatsapp_direct_orders.sql");
const orchestrator = read("src/server/conversations/whatsapp-direct-order-orchestrator.ts");
const orderService = read("src/server/conversations/whatsapp-order-service.ts");
const webhook = read("src/app/api/webhooks/whatsapp/route.ts");
const settingsService = read("src/server/conversations/settings-service.ts");
const settingsAction = read("src/features/conversations/settings-actions.ts");
const settingsPage = read("src/app/(app)/configuracoes/conversas/page.tsx");

describe("WhatsApp direct orders", () => {
  it("recognizes explicit order intent without stealing the online menu option", () => {
    expect(resolveWhatsAppBotIntent("7", "menu")).toBe("order_start");
    expect(resolveWhatsAppBotIntent("quero pedir", "menu")).toBe("order_start");
    expect(resolveWhatsAppBotIntent("cardápio", "menu")).toBe("menu_link");
  });

  it("shows the direct order option only when the store enabled it", () => {
    expect(buildWhatsAppBotMenu("Loja")).not.toContain("7 — Fazer pedido pelo WhatsApp");
    expect(buildWhatsAppBotMenu("Loja", true)).toContain("7 — Fazer pedido pelo WhatsApp");
    expect(appendWhatsAppBotMenu("Olá", true)).toContain("7 — Fazer pedido pelo WhatsApp");
  });

  it("parses multiple item lines independently and keeps cart quantity limits", () => {
    expect(looksLikeWhatsAppOrderItems("2 Coxinha\n1 Refrigerante lata")).toBe(true);
    expect(parseWhatsAppOrderItems("2 Coxinha\n1 Refrigerante lata")).toEqual([
      { quantity: 2, query: "Coxinha" },
      { quantity: 1, query: "Refrigerante lata" },
    ]);
    expect(parseWhatsAppOrderItems("100 Coxinhas")).toEqual([]);
  });

  it("requires an explicit final confirmation before creating the official order", () => {
    expect(orderService).toContain('input.step === "order_confirmation"');
    expect(orderService).toContain("if (!isYes(input.text))");
    expect(orderService.indexOf("if (!isYes(input.text))")).toBeLessThan(orderService.indexOf("OrderService.createFromCheckout"));
    expect(orderService).toContain('update({ channel: "whatsapp"');
  });

  it("reuses the existing pricing, checkout, delivery and order pipeline", () => {
    expect(orderService).toContain("CartService.addItem");
    expect(orderService).toContain("CheckoutService.saveIdentity");
    expect(orderService).toContain("CheckoutService.saveFulfillment");
    expect(orderService).toContain("CheckoutService.saveAddress");
    expect(orderService).toContain("CheckoutService.savePayment");
    expect(orderService).toContain("OrderService.createFromCheckout");
  });

  it("keeps product lookup tenant-scoped and refuses required modifiers instead of guessing", () => {
    expect(orderService).toContain('.eq("organization_id", organizationId)');
    expect(orderService).toContain('.eq("store_id", storeId)');
    expect(orderService).toContain('error.code === "invalid_modifiers"');
    expect(orderService).toContain("precisa escolher sabor, tamanho ou adicional");
  });

  it("lets customers exit to the menu or request a human during checkout", () => {
    expect(orchestrator).toContain('normalizeBotInput(inbound.body) === "menu"');
    expect(orchestrator).toContain("wantsHuman(inbound.body)");
    expect(orchestrator).toContain('p_target_state: "waiting_agent"');
  });

  it("runs direct ordering before the generic greeting bot", () => {
    expect(webhook).toContain("WhatsAppDirectOrderOrchestrator.afterInbound");
    expect(webhook).toContain("if (!orderHandled) await ConversationGreetingService.afterInbound");
    expect(webhook.indexOf("WhatsAppDirectOrderOrchestrator.afterInbound")).toBeLessThan(webhook.indexOf("ConversationGreetingService.afterInbound"));
  });

  it("is opt-in per store and configurable from Conversas", () => {
    expect(migration).toContain("whatsapp_orders_enabled boolean not null default false");
    expect(settingsService).toContain("whatsappOrdersEnabled: z.boolean()");
    expect(settingsService).toContain("whatsapp_orders_enabled: values.whatsappOrdersEnabled");
    expect(settingsAction).toContain('checked(formData, "whatsappOrdersEnabled")');
    expect(settingsPage).toContain("Aceitar pedidos pelo WhatsApp");
    expect(settingsPage).toContain('name="whatsappOrdersEnabled"');
  });
});
