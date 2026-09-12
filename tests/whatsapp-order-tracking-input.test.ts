import { describe, expect, it } from "vitest";
import { resolveWhatsAppBotIntent, trackingCodeFromInput } from "@/server/conversations/bot-menu";

describe("WhatsApp order tracking input", () => {
  it.each([
    ["42", 42],
    ["#42", 42],
    ["pedido 42", 42],
    ["pedido #42", 42],
    ["meu pedido é 42", 42],
    ["o número do pedido é 154", 154],
    ["pedido número 987", 987],
    ["quero saber do pedido 321", 321],
    ["acompanhar pedido 765", 765],
    ["status do pedido 88", 88],
  ])("extracts the order number from %s", (text, expected) => {
    expect(trackingCodeFromInput(text)).toBe(expected);
  });

  it("does not treat ordinary numbers as a tracking request while on the menu", () => {
    expect(resolveWhatsAppBotIntent("2", "menu")).toBe("track_start");
    expect(resolveWhatsAppBotIntent("5", "menu")).toBe("payment");
  });

  it("accepts a bare number after asking for the tracking code", () => {
    expect(resolveWhatsAppBotIntent("154", "awaiting_tracking_code")).toBe("track_code");
  });

  it.each([
    "pedido 154",
    "meu pedido é 154",
    "o número do pedido é 154",
    "quero saber do pedido 154",
  ])("tracks directly from a natural phrase without forcing a second prompt: %s", (text) => {
    expect(resolveWhatsAppBotIntent(text, "menu")).toBe("track_code");
  });

  it("rejects ambiguous phrases containing more than one number", () => {
    expect(trackingCodeFromInput("pedido 12 ou 13")).toBeNull();
  });
});
