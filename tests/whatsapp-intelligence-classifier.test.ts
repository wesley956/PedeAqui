import { describe, expect, it } from "vitest";
import { buildWhatsAppIntelligenceMatrix } from "@/server/conversations/whatsapp-intelligence-lab";
import {
  classifyWhatsAppIntelligenceIntent,
  scoreWhatsAppIntelligenceMatrix,
} from "@/server/conversations/whatsapp-intelligence-classifier";

describe("WhatsApp intelligence classifier", () => {
  it.each([
    ["eu queria fazer um pedido", "menu", "order_start"],
    ["poderia pedir aqui", "menu", "order_start"],
    ["quero fazer outro pedido", "menu", "order_start"],
    ["acompanhar meu pedido", "menu", "track_start"],
    ["pedido 68", "menu", "track_code"],
    ["68", "awaiting_tracking_code", "track_code"],
    ["quais os sabores do pastel?", "order_items", "flavor_question"],
    ["preços", "menu", "price_question"],
    ["Qto tá os pastéis??", "menu", "price_question"],
    ["você já tem meu endereço?", "order_address", "address"],
    ["valeu obrigado", "menu", "social_ack"],
  ] as const)("classifies %s in %s as %s", (text, phase, expected) => {
    expect(classifyWhatsAppIntelligenceIntent(text, phase).intent).toBe(expected);
  });

  it("scores the full 720-scenario corpus instead of testing only happy paths", () => {
    const score = scoreWhatsAppIntelligenceMatrix(buildWhatsAppIntelligenceMatrix());
    expect(score.total).toBe(720);
    expect(score.recognitionRate).toBeGreaterThanOrEqual(0.7);
    expect(score.exactRate).toBeGreaterThanOrEqual(0.55);
    expect(score.criticalUnknown).toBeLessThanOrEqual(24);
  });
});
