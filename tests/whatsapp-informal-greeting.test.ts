import { describe, expect, it } from "vitest";
import { resolveWhatsAppBotIntent } from "@/server/conversations/bot-menu";
import { createIntelligenceContext } from "@/server/intelligence/context";
import { UnifiedIntelligenceRouter } from "@/server/intelligence/unified-router";

function context(mode: "bot" | "human" | "waiting_agent" = "bot") {
  return createIntelligenceContext({
    requestId: "technical-greeting", correlationId: "technical-greeting",
    organizationId: "11111111-1111-4111-8111-111111111111", storeId: "22222222-2222-4222-8222-222222222222",
    channel: "whatsapp", businessType: "restaurant", actor: { type: "customer", userId: null }, audience: "customer",
    conversation: { id: "33333333-3333-4333-8333-333333333333", mode },
    identity: { source: "whatsapp_contact", trust: "weak", contactId: "44444444-4444-4444-8444-444444444444", customerId: null },
    activeReferences: { cartId: null, orderId: null }, external: { provider: "meta_cloud", accountId: null },
    authority: { resolved: false, key: null }, capabilities: { resolved: false, revision: null },
  });
}

describe("informal greeting preserves canonical routing", () => {
  it.each(["Oii", "Oiiii!", "Oii tudo bem?"])("recognizes %s without low-confidence fallback", message => {
    expect(resolveWhatsAppBotIntent(message, "menu")).toBe("menu");
    expect(UnifiedIntelligenceRouter.route({ context: context(), message, session: { active: false, kind: null, step: null } })).toMatchObject({ intent: "menu", tool: "conversation_info", wouldHandle: true });
  });

  it.each(["Oii", "Oiiii!"])("keeps tracking context for %s", message => {
    expect(resolveWhatsAppBotIntent(message, "awaiting_tracking_code")).toBe("track_start");
  });

  it.each([
    ["Oii, aceita Pix?", "payment"],
    ["Oii, meu pedido já saiu?", "track_start"],
    ["Oii, quero fazer um pedido", "order_start"],
    ["Oii, falar com atendente", "handoff"],
    ["Oii, qual o horário?", "hours"],
  ] as const)("preserves the request after greeting: %s", (message, intent) => {
    expect(resolveWhatsAppBotIntent(message, "menu")).toBe(intent);
  });

  it.each(["human", "waiting_agent"] as const)("does not bypass %s for a greeting", mode => {
    expect(UnifiedIntelligenceRouter.route({ context: context(mode), message: "Oii", session: { active: true, kind: "whatsapp_order", step: "order_items" } })).toMatchObject({ wouldHandle: false, tool: null, handoffReason: "human_lock" });
  });

  it("does not classify arbitrary words starting with oi as a greeting", () => {
    expect(resolveWhatsAppBotIntent("oiiproduto", "menu")).toBe("unknown");
    expect(resolveWhatsAppBotIntent("oito", "menu")).toBe("unknown");
  });
});
