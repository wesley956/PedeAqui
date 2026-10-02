import { describe, expect, it } from "vitest";
import { resolveWhatsAppBotIntent } from "@/server/conversations/bot-menu";
import { resolveNaturalFulfillment, resolveNaturalPixSpeech } from "@/server/conversations/whatsapp-contextual-language";
import { resolveWhatsAppPaymentSelection, type WhatsAppPaymentOption } from "@/server/conversations/whatsapp-payment-methods";
import { canonicalPaymentGuidanceMessage } from "@/server/conversations/whatsapp-payment-guidance";
import { isActiveOrderTrackingQuestion } from "@/server/conversations/whatsapp-active-order-side-intent-core";
import { classifyWhatsAppIntelligenceIntent } from "@/server/conversations/whatsapp-intelligence-classifier";

const options: WhatsAppPaymentOption[] = [
  { method: "pix", enabled: true, sortOrder: 1 },
  { method: "cash", enabled: true, sortOrder: 2 },
  { method: "custom", enabled: true, sortOrder: 3, label: "Ticket", customPaymentMethodId: "ticket-id" },
];

describe("INT-EVOL-05 contextual payment", () => {
  it.each(["seria no Pix", "quero pagar no pix", "vou pagar via pix", "piks", "pixx", "pix por favor"])("selects only an enabled canonical Pix for %s", text => {
    expect(resolveNaturalPixSpeech(text)).toBe("selection");
    expect(resolveWhatsAppPaymentSelection(text, options)?.method).toBe("pix");
    expect(resolveWhatsAppPaymentSelection(text, options.map(option => ({ ...option, enabled: option.method !== "pix" })))).toBeNull();
  });
  it.each(["aceita pix?", "pode ser pix?", "teria como mandar a chave pix", "manda a chave", "envia o qr", "não quero pix", "pix ou dinheiro"])("keeps %s read-only", text => {
    expect(resolveWhatsAppBotIntent(text, "menu")).toBe("payment");
    expect(resolveWhatsAppPaymentSelection(text, options)).toBeNull();
  });
  it("explains instructions without fabricating a key or changing payment", () => {
    expect(canonicalPaymentGuidanceMessage(options, "manda a chave")).toContain("confirmação do pedido");
    const unavailable = canonicalPaymentGuidanceMessage(options.map(option => ({ ...option, enabled: option.method !== "pix" })), "manda a chave");
    expect(unavailable).toContain("Pix não está disponível");
    expect(unavailable).toContain("Ticket");
    expect(resolveWhatsAppPaymentSelection("Ticket", options)?.customPaymentMethodId).toBe("ticket-id");
  });
});

describe("INT-EVOL-06 contextual tracking and fulfillment", () => {
  it.each(["O meu está pronto?", "já ficou pronto?", "meu pedido já saiu?", "posso ir buscar?"])("routes %s through tracking instead of generic fallback", text => {
    expect(resolveWhatsAppBotIntent(text, "menu")).toBe("track_start");
    expect(isActiveOrderTrackingQuestion(text)).toBe(true);
    expect(classifyWhatsAppIntelligenceIntent(text, "order_items").intent).toBe("track_start");
  });
  it("interprets pickup only as a choice at the canonical fulfillment step", () => {
    expect(resolveNaturalFulfillment("posso ir buscar?")).toBe("pickup");
    expect(classifyWhatsAppIntelligenceIntent("posso ir buscar?", "order_fulfillment").intent).toBe("delivery");
    expect(resolveNaturalFulfillment("Pode entregar então por favor")).toBe("delivery");
    expect(resolveNaturalFulfillment("se não eu posso ir retirar aí")).toBeNull();
    expect(resolveNaturalFulfillment("entrega ou retirada")).toBeNull();
    expect(resolveNaturalFulfillment("não quero entrega")).toBeNull();
    expect(resolveNaturalFulfillment("meu pedido já foi entregue?")).toBeNull();
  });
  it.each(["quero fazer um pedido", "pedido de 20 coxinhas", "adiciona 2", "quero retirar 20 salgados"])("does not mistake %s for a status question", text => {
    expect(isActiveOrderTrackingQuestion(text)).toBe(false);
  });
});
