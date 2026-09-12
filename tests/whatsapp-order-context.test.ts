import { describe, expect, it } from "vitest";
import {
  compositionFitsProduct,
  inferProductCapacityFromName,
  parseOrderComposition,
  resolvePendingChoiceReference,
} from "@/server/conversations/whatsapp-order-context";

const choices = [
  { label: "Caixa com 30 salgados", value: "produto-30" },
  { label: "Caixa com 50 salgados", value: "produto-50" },
];

describe("WhatsApp order conversational context", () => {
  it("understands numbered and ordinal replies against the last offered choices", () => {
    expect(resolvePendingChoiceReference("1", choices)?.value).toBe("produto-30");
    expect(resolvePendingChoiceReference("opção 2", choices)?.value).toBe("produto-50");
    expect(resolvePendingChoiceReference("a primeira", choices)?.value).toBe("produto-30");
    expect(resolvePendingChoiceReference("segunda", choices)?.value).toBe("produto-50");
  });

  it("does not guess 'essa mesma' when more than one option is still possible", () => {
    expect(resolvePendingChoiceReference("essa msm", choices)).toBeNull();
    expect(resolvePendingChoiceReference("essa msm", [choices[0]!])?.value).toBe("produto-30");
  });

  it("parses a natural multi-flavor composition and sums the quantities", () => {
    const composition = parseOrderComposition("15 coxinhas de frango, 10 bolinhas de queijo, 5 salsichas");
    expect(composition?.total).toBe(30);
    expect(composition?.parts).toHaveLength(3);
    expect(composition?.parts[0]?.normalizedLabel).toContain("coxinha");
    expect(composition?.parts[1]?.normalizedLabel).toContain("bolinha");
    expect(composition?.parts[2]?.normalizedLabel).toContain("salsicha");
  });

  it("recognizes when a composition matches a package capacity", () => {
    expect(inferProductCapacityFromName("Caixa com 30 salgados")).toBe(30);
    expect(compositionFitsProduct("15 coxinha, 10 bolinha, 5 salsicha", "Caixa com 30 salgados")).toBe(true);
    expect(compositionFitsProduct("15 coxinha, 10 bolinha, 5 salsicha", "Caixa com 50 salgados")).toBe(false);
  });
});
