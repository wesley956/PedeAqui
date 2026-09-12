import { describe, expect, it } from "vitest";
import {
  isOrderEditRequest,
  repairSuspiciousPackageQuantity,
  restartOrderMessage,
} from "@/server/conversations/whatsapp-order-corrections";

describe("WhatsApp order corrections", () => {
  it.each([
    "quero mudar o pedido",
    "quero alterar meu pedido",
    "trocar o pedido",
    "refazer pedido",
  ])("recognizes an order edit request: %s", (text) => {
    expect(isOrderEditRequest(text)).toBe(true);
  });

  it("does not confuse ordinary order text with an edit request", () => {
    expect(isOrderEditRequest("quero uma caixa de 30 salgados")).toBe(false);
  });

  it("repairs stale pending-choice quantity when the package capacity was mistaken for package count", () => {
    const context = {
      channel: "whatsapp_order",
      version: 1,
      pendingChoices: [
        { productId: "p1", name: "Caixa com 30 salgados", quantity: 30 },
      ],
    };
    expect(repairSuspiciousPackageQuantity(context, "Eu quero a caixa de 30 salgado")).toEqual({
      ...context,
      pendingChoices: [
        { productId: "p1", name: "Caixa com 30 salgados", quantity: 1 },
      ],
    });
  });

  it("repairs an already-created pending composition before it can add 30 boxes by mistake", () => {
    const context = {
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
    const repaired = repairSuspiciousPackageQuantity(context, "quero sortido") as typeof context;
    expect(repaired.pendingComposition.quantity).toBe(1);
  });

  it("preserves an explicit request for many packages", () => {
    const context = {
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
    const repaired = repairSuspiciousPackageQuantity(context, "30 caixas sortidas") as typeof context;
    expect(repaired.pendingComposition.quantity).toBe(30);
  });

  it("makes clear that restarting drops the previous draft", () => {
    expect(restartOrderMessage().toLowerCase()).toContain("desconsiderei a montagem anterior");
  });
});
