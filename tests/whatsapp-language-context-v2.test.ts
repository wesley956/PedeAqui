import { describe, expect, it } from "vitest";
import {
  looseTokenSimilarity,
  normalizeInformalPortuguese,
  normalizeProductLanguage,
} from "@/server/conversations/language-normalization";

describe("WhatsApp informal Portuguese normalization v2", () => {
  it("normalizes common food typos and abbreviations", () => {
    expect(normalizeInformalPortuguese("15 coxina frgo")).toBe("15 coxinha frango");
    expect(normalizeInformalPortuguese("10 bolimha qjo")).toBe("10 bolinha queijo");
    expect(normalizeInformalPortuguese("5 salcicha")).toBe("5 salsicha");
    expect(normalizeInformalPortuguese("2 refri")).toBe("2 refrigerante");
  });

  it("normalizes very informal confirmations and conversational references", () => {
    expect(normalizeInformalPortuguese("essa msm")).toBe("essa mesma");
    expect(normalizeInformalPortuguese("a primeira")).toBe("opcao 1");
    expect(normalizeInformalPortuguese("pode manda")).toBe("quero");
    expect(normalizeInformalPortuguese("ss pode confirmar")).toBe("sim pode confirmar");
  });

  it("understands colloquial quantities", () => {
    expect(normalizeInformalPortuguese("meia duzia coxina")).toBe("6 coxinha");
    expect(normalizeInformalPortuguese("duas duzias de salcicha")).toBe("24 de salsicha");
    expect(normalizeInformalPortuguese("uma dezena de bolimha")).toBe("10 de bolinha");
  });

  it("uses conservative fuzzy correction for unseen near-miss spellings", () => {
    expect(normalizeInformalPortuguese("coxinhq de frango")).toBe("coxinha de frango");
    expect(normalizeInformalPortuguese("refrigerantte lata")).toBe("refrigerante lata");
    expect(normalizeInformalPortuguese("hamburgueer")).toBe("hamburguer");
  });

  it("keeps useful product normalization deterministic", () => {
    expect(normalizeProductLanguage("2 Coca-Cola 2 litros")).toBe("2 coca cola 2l");
    expect(normalizeProductLanguage("1 refri 350 ml")).toBe("1 refrigerante 350ml");
  });

  it("provides fuzzy token similarity without treating unrelated words as equal", () => {
    expect(looseTokenSimilarity("coxinaa", "coxinha")).toBeGreaterThan(0.8);
    expect(looseTokenSimilarity("quejo", "queijo")).toBeGreaterThan(0.8);
    expect(looseTokenSimilarity("coxinha", "refrigerante")).toBeLessThan(0.5);
  });
});
