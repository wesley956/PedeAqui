import { describe, expect, it } from "vitest";
import { buildWhatsAppBotMenu, resolveWhatsAppBotIntent } from "@/server/conversations/bot-menu";

describe("WhatsApp bot store info", () => {
  it("understands natural questions about hours", () => {
    expect(resolveWhatsAppBotIntent("Qual o horário de funcionamento?", "menu")).toBe("hours");
    expect(resolveWhatsAppBotIntent("vocês estão abertos?", "menu")).toBe("hours");
  });

  it("understands payment questions", () => {
    expect(resolveWhatsAppBotIntent("Aceita cartão?", "menu")).toBe("payment");
    expect(resolveWhatsAppBotIntent("quais formas de pagamento?", "menu")).toBe("payment");
  });

  it("understands delivery and fee questions", () => {
    expect(resolveWhatsAppBotIntent("Faz entrega em Americana, qual a taxa?", "menu")).toBe("delivery");
    expect(resolveWhatsAppBotIntent("qual o frete?", "menu")).toBe("delivery");
  });

  it("keeps existing menu intents", () => {
    expect(resolveWhatsAppBotIntent("1", "menu")).toBe("menu_link");
    expect(resolveWhatsAppBotIntent("2", "menu")).toBe("track_start");
    expect(resolveWhatsAppBotIntent("3", "menu")).toBe("handoff");
    expect(buildWhatsAppBotMenu("Dona Maria")).toContain("6 — Entrega e taxa");
  });
});
