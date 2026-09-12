import { describe, expect, it } from "vitest";
import { looseTokenSimilarity, normalizeInformalPortuguese, normalizeProductLanguage } from "@/server/conversations/language-normalization";

describe("informal Brazilian Portuguese normalization", () => {
  it("normalizes common chat abbreviations and food typos", () => {
    expect(normalizeInformalPortuguese("qro 15 coxina frgo, 10 bolinha qjo e 5 salsixa"))
      .toBe("quero 15 coxinha frango, 10 bolinha queijo e 5 salsicha");
  });

  it("normalizes informal selection phrases", () => {
    expect(normalizeInformalPortuguese("pode ser a primeira"))
      .toContain("opcao 1");
    expect(normalizeInformalPortuguese("essa msm"))
      .toBe("essa mesma");
  });

  it("normalizes quantity expressions", () => {
    expect(normalizeInformalPortuguese("meia duzia coxina")).toBe("6 coxinha");
    expect(normalizeInformalPortuguese("uma duzia bolinha qjo")).toBe("12 bolinha queijo");
  });

  it("keeps product normalization deterministic", () => {
    expect(normalizeProductLanguage("CX 30 SALGADOS")).toBe("caixa 30 salgados");
    expect(normalizeProductLanguage("Refri 2 litros")).toBe("refrigerante 2l");
  });

  it("separates glued quantities from unit words", () => {
    expect(normalizeInformalPortuguese("Caixa de 30unidade")).toContain("30 unidade");
    expect(normalizeProductLanguage("Caixa de 30unidade")).toBe("caixa de 30 unidade");
  });

  it("removes conversational filler from product matching", () => {
    expect(normalizeInformalPortuguese("Eu quero uma caixa")).toBe("quero uma caixa");
    expect(normalizeProductLanguage("caixa de 30 salgado então")).toBe("caixa de 30 salgado");
    expect(normalizeProductLanguage("caixa de 30 salgado seila")).toBe("caixa de 30 salgado");
  });

  it("handles close spelling mistakes with bounded similarity", () => {
    expect(looseTokenSimilarity("coxina", "coxinha")).toBeGreaterThan(0.9);
    expect(looseTokenSimilarity("cochinha", "coxinha")).toBeGreaterThan(0.8);
    expect(looseTokenSimilarity("pizza", "coxinha")).toBeLessThan(0.5);
  });
});
