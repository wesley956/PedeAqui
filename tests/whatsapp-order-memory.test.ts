import { describe, expect, it } from "vitest";
import {
  addressPartsFromMessage,
  addressProgressPrompt,
  clearPendingAddressParts,
  clearPendingOrderQuantity,
  pendingAddressParts,
  pendingOrderQuantity,
  rememberAddressParts,
  rememberOrderQuantity,
} from "@/server/conversations/whatsapp-order-memory";

describe("INT-EVOL-02 WhatsApp order memory", () => {
  it("remembers and clears a standalone quantity without losing the existing order context", () => {
    const initial = { channel: "whatsapp_order", version: 1, cartToken: "cart-1" };
    const remembered = rememberOrderQuantity(initial, 20);
    expect(pendingOrderQuantity(remembered)).toBe(20);
    expect(remembered.cartToken).toBe("cart-1");

    const cleared = clearPendingOrderQuantity(remembered);
    expect(pendingOrderQuantity(cleared)).toBeNull();
    expect(cleared.cartToken).toBe("cart-1");
  });

  it("normalizes common Brazilian address separators before canonical checkout parsing", () => {
    expect(addressPartsFromMessage("Rua dos Mognos, 440 - Jardim da Alvorada, Nova Odessa - SP")).toEqual([
      "Rua dos Mognos",
      "440",
      "Jardim da Alvorada",
      "Nova Odessa",
      "SP",
    ]);
    expect(addressPartsFromMessage("Rua dos Mognos 440")).toEqual(["Rua dos Mognos", "440"]);
    expect(addressPartsFromMessage("Nova Odessa/SP")).toEqual(["Nova Odessa", "SP"]);
  });

  it("keeps fragmented address parts bounded and resumable across messages", () => {
    const first = rememberAddressParts({ channel: "whatsapp_order", version: 1 }, ["Rua dos Mognos"]);
    expect(pendingAddressParts(first)).toEqual(["Rua dos Mognos"]);
    expect(addressProgressPrompt(1)).toContain("número");

    const second = rememberAddressParts(first, ["Rua dos Mognos", "440"]);
    expect(pendingAddressParts(second)).toEqual(["Rua dos Mognos", "440"]);
    expect(addressProgressPrompt(2)).toContain("bairro");

    const cleared = clearPendingAddressParts(second);
    expect(pendingAddressParts(cleared)).toEqual([]);
  });
});
