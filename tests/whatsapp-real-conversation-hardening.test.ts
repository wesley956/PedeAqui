import { describe, expect, it } from "vitest";
import { normalizeBotInput } from "@/server/conversations/bot-menu";
import { isAssortedCompositionRequest } from "@/server/conversations/whatsapp-assorted-composition";
import { isOrderEditRequest, repairSuspiciousPackageQuantity } from "@/server/conversations/whatsapp-order-corrections";

describe("WhatsApp real-conversation hardening", () => {
  it("repairs mini-churros package capacity after a numbered pending choice", () => {
    const context = {
      channel: "whatsapp_order",
      version: 1,
      pendingChoices: [
        { productId: "100", name: "Caixa com 100 mini churros", quantity: 30 },
        { productId: "30", name: "Caixa com 30 mini churros", quantity: 30 },
        { productId: "50", name: "Caixa com 50 mini churros", quantity: 30 },
      ],
    };

    const repaired = repairSuspiciousPackageQuantity(context, "2") as typeof context;
    expect(repaired.pendingChoices[1]?.quantity).toBe(1);
    expect(repaired.pendingChoices[0]?.quantity).toBe(30);
    expect(repaired.pendingChoices[2]?.quantity).toBe(30);
  });

  it("keeps an explicit multi-package quantity when the customer really asks for many boxes", () => {
    const context = {
      channel: "whatsapp_order",
      version: 1,
      pendingChoices: [
        { productId: "30", name: "Caixa com 30 mini churros", quantity: 30 },
      ],
    };

    const repaired = repairSuspiciousPackageQuantity(context, "30 caixas de 30 mini churros") as typeof context;
    expect(repaired.pendingChoices[0]?.quantity).toBe(30);
  });

  it.each([
    "Não quero 30 caixa",
    "é só uma caixa",
    "1 caixa só",
  ])("treats quantity correction as an order edit: %s", (text) => {
    expect(isOrderEditRequest(text)).toBe(true);
  });

  it.each([
    "Pode escolher",
    "escolhe pra mim",
    "faz como você achar melhor",
  ])("accepts customer-led assorted composition: %s", (text) => {
    expect(isAssortedCompositionRequest(text)).toBe(true);
  });

  it("normalizes the real menu typo without changing the menu flow", () => {
    expect(normalizeBotInput("Meni")).toBe("menu");
  });

  it("normalizes the social abbreviation seen after handoff", () => {
    expect(normalizeBotInput("Obgda")).toBe("obrigado");
  });
});
