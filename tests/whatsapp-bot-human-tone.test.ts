import { describe, expect, it } from "vitest";
import {
  buildOrderLookupMessage,
  buildWhatsAppBotMenu,
  normalizeBotInput,
  resolveWhatsAppBotIntent,
  TRACKING_CODE_PROMPT,
} from "@/server/conversations/bot-menu";

describe("WhatsApp bot human tone", () => {
  it("normalizes punctuation and accents from natural messages", () => {
    expect(normalizeBotInput("Oi, tudo bem?!")).toBe("oi tudo bem");
  });

  it.each([
    ["me manda o cardápio por favor", "menu_link"],
    ["onde está meu pedido?", "track_start"],
    ["quero falar com uma pessoa", "handoff"],
    ["vocês estão abertos?", "hours"],
    ["aceita cartão?", "payment"],
    ["quanto tempo demora a entrega?", "delivery"],
    ["posso pedir por aqui?", "order_start"],
  ])("understands natural phrase %s", (message, intent) => {
    expect(resolveWhatsAppBotIntent(message, "menu")).toBe(intent);
  });

  it("keeps the menu useful without forcing numeric-only interaction", () => {
    const menu = buildWhatsAppBotMenu("Dona Maria", true);
    expect(menu).toContain("pode escrever normalmente");
    expect(menu).toContain("Dona Maria");
    expect(menu).toContain("7 — Fazer meu pedido por aqui");
  });

  it("uses warmer tracking language while preserving order facts", () => {
    expect(TRACKING_CODE_PROMPT).toContain("Claro!");
    const message = buildOrderLookupMessage({
      displayNumber: 42,
      orderStatus: "confirmed",
      productionStatus: "preparing",
      fulfillmentStatus: "pending",
    });
    expect(message).toContain("Achei seu pedido #42");
    expect(message).toContain("em preparo");
  });
});
