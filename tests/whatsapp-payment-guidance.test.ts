import { describe, expect, it } from "vitest";
import { asksAboutPixPayment, pixPaymentGuidanceMessage } from "@/server/conversations/whatsapp-payment-guidance";

describe("WhatsApp Pix payment guidance", () => {
  it.each([
    "tem pix?",
    "aceita pics",
    "quero pagar no pix",
    "posso fazer piks?",
    "não apareceu pix",
    "vou pagar via pix",
  ])("recognizes Pix questions and variants: %s", (text) => {
    expect(asksAboutPixPayment(text)).toBe(true);
  });

  it("does not trigger on unrelated payment text", () => {
    expect(asksAboutPixPayment("vou pagar no cartão")).toBe(false);
    expect(asksAboutPixPayment("dinheiro")).toBe(false);
  });

  it("uses only the payment methods configured by the current store", () => {
    const message = pixPaymentGuidanceMessage();
    expect(message).toContain("Pix");
    expect(message.toLowerCase()).toContain("esta loja");
    expect(message).not.toContain("1 — Dinheiro");
    expect(message.toLowerCase()).not.toContain("você pode pagar via pix");
  });
});
