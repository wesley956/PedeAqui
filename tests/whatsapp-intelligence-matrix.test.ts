import { describe, expect, it } from "vitest";
import {
  buildWhatsAppIntelligenceMatrix,
  summarizeWhatsAppIntelligenceMatrix,
  WHATSAPP_FLOW_PHASES,
  WHATSAPP_PROTECTED_INVARIANTS,
} from "@/server/conversations/whatsapp-intelligence-lab";
import { resolveWhatsAppBotIntent, trackingCodeFromInput } from "@/server/conversations/bot-menu";
import { isOrderEditRequest, repairSuspiciousPackageQuantity } from "@/server/conversations/whatsapp-order-corrections";
import { isAssortedCompositionRequest } from "@/server/conversations/whatsapp-assorted-composition";
import { asksAboutPixPayment } from "@/server/conversations/whatsapp-payment-guidance";

describe("WhatsApp Intelligence Lab matrix", () => {
  const matrix = buildWhatsAppIntelligenceMatrix();

  it("keeps a deterministic baseline of at least 720 scenarios", () => {
    expect(matrix).toHaveLength(720);
    expect(new Set(matrix.map((scenario) => scenario.id)).size).toBe(matrix.length);
  });

  it("covers every current conversation phase", () => {
    for (const phase of WHATSAPP_FLOW_PHASES) {
      expect(matrix.some((scenario) => scenario.phase === phase), phase).toBe(true);
    }
  });

  it("covers every planned risk family with meaningful volume", () => {
    const summary = summarizeWhatsAppIntelligenceMatrix();
    expect(Object.keys(summary.byFamily)).toHaveLength(15);
    for (const count of Object.values(summary.byFamily)) expect(count).toBeGreaterThanOrEqual(48);
    expect(summary.critical).toBeGreaterThanOrEqual(100);
  });

  it("documents the protected operational contracts before intelligence changes", () => {
    expect(WHATSAPP_PROTECTED_INVARIANTS.length).toBeGreaterThanOrEqual(15);
    expect(WHATSAPP_PROTECTED_INVARIANTS.some((item) => item.includes("confirmação explícita"))).toBe(true);
    expect(WHATSAPP_PROTECTED_INVARIANTS.some((item) => item.includes("rastreamento"))).toBe(true);
    expect(WHATSAPP_PROTECTED_INVARIANTS.some((item) => item.includes("organization_id/store_id"))).toBe(true);
  });

  it("contains the real Dona Maria failures as permanent regression scenarios", () => {
    const baseMessages = matrix
      .filter((scenario) => scenario.languageVariant === "base")
      .map((scenario) => scenario.message.toLowerCase());
    expect(baseMessages).toContain("eu queria fazer um pedido");
    expect(baseMessages).toContain("poderia pedir aqui");
    expect(baseMessages).toContain("quais os sabores do pastel");
    expect(baseMessages).toContain("você já tem meu endereço");
    expect(baseMessages).toContain("sortido");
    expect(baseMessages).toContain("quero mudar o pedido");
  });
});

describe("WhatsApp protected runtime invariants", () => {
  it("keeps explicit order-start separate from tracking", () => {
    expect(resolveWhatsAppBotIntent("quero fazer um pedido", "menu")).toBe("order_start");
    expect(resolveWhatsAppBotIntent("acompanhar pedido", "menu")).toBe("track_start");
    expect(resolveWhatsAppBotIntent("pedido 68", "menu")).toBe("track_code");
    expect(trackingCodeFromInput("pedido 68")).toBe(68);
  });

  it("keeps package capacity separate from explicit package quantity", () => {
    const stale = {
      channel: "whatsapp_order",
      version: 1,
      pendingComposition: {
        productId: "p1",
        name: "Caixa com 30 salgados",
        quantity: 30,
        groupId: "g1",
        groupName: "Sabores",
        distributionTotal: 30,
      },
    };
    expect((repairSuspiciousPackageQuantity(stale, "quero sortido") as typeof stale).pendingComposition.quantity).toBe(1);
    expect((repairSuspiciousPackageQuantity(stale, "30 caixas sortidas") as typeof stale).pendingComposition.quantity).toBe(30);
  });

  it("keeps recent language protections active", () => {
    expect(isAssortedCompositionRequest("variado")).toBe(true);
    expect(isAssortedCompositionRequest("distribui igual nos 7 sabores")).toBe(true);
    expect(isOrderEditRequest("quero mudar o pedido")).toBe(true);
    expect(asksAboutPixPayment("posso pagar no pix na entrega?")).toBe(true);
  });
});
