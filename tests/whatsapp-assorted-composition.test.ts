import { describe, expect, it } from "vitest";
import {
  assortedRequestedFlavorCount,
  buildEqualSplitCompositionText,
  isAssortedCompositionRequest,
} from "@/server/conversations/whatsapp-assorted-composition";

describe("WhatsApp assorted composition", () => {
  it.each([
    "Sortido",
    "Variado",
    "Pode fazer a distribuição igualitário em os 7 sabores",
    "pode distribuir igual entre todos os sabores",
    "um pouco de cada",
    "todos os sabores",
  ])("recognizes assorted/equal split requests: %s", (text) => {
    expect(isAssortedCompositionRequest(text)).toBe(true);
  });

  it("does not confuse an explicit composition with assorted", () => {
    expect(isAssortedCompositionRequest("15 coxinha e 15 bolinha de queijo")).toBe(false);
  });

  it("extracts an explicitly requested flavor count", () => {
    expect(assortedRequestedFlavorCount("distribui igual nos 7 sabores")).toBe(7);
    expect(assortedRequestedFlavorCount("sortido")).toBeNull();
  });

  it("builds the fairest possible split when the total is not divisible", () => {
    expect(buildEqualSplitCompositionText(30, ["A", "B", "C", "D", "E", "F", "G"]))
      .toBe("5 A, 5 B, 4 C, 4 D, 4 E, 4 F, 4 G");
  });
});
