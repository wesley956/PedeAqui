import { describe, expect, it } from "vitest";
import { normalizeInformalPortuguese, normalizeProductLanguage } from "@/server/conversations/language-normalization";

describe("WhatsApp natural package phrasing", () => {
  it("adds an implicit single unit to a bare package name", () => {
    expect(normalizeInformalPortuguese("caixa de 30 salgados")).toBe("uma caixa de 30 salgados");
    expect(normalizeInformalPortuguese("cx de 30 salgados")).toBe("uma caixa de 30 salgados");
    expect(normalizeInformalPortuguese("pacote com 50 unidades")).toBe("um pacote com 50 unidade");
  });

  it("understands written tens in package quantities", () => {
    expect(normalizeInformalPortuguese("me vê uma caixa com trinta salgados")).toBe("quero uma caixa com 30 salgados");
    expect(normalizeInformalPortuguese("cinquenta unidades")).toBe("50 unidade");
  });

  it("keeps package normalization aligned between customer text and catalog names", () => {
    expect(normalizeProductLanguage("Caixa com 30 salgados")).toBe("caixa com 30 salgados");
    expect(normalizeProductLanguage("cx com trinta salgados")).toBe("caixa com 30 salgados");
  });
});
