import { describe, expect, it } from "vitest";
import { normalizeInformalPortuguese, normalizeProductLanguage } from "@/server/conversations/language-normalization";
import { parseWhatsAppOrderItems } from "@/server/conversations/whatsapp-order-service";

describe("WhatsApp natural package phrasing", () => {
  it("treats a bare package name as one requested item", () => {
    expect(parseWhatsAppOrderItems("caixa de 30 salgados")).toEqual([{ quantity: 1, query: "caixa de 30 salgados" }]);
  });

  it("understands a written package quantity", () => {
    expect(normalizeInformalPortuguese("me vê uma caixa com trinta salgados")).toContain("30");
    expect(parseWhatsAppOrderItems("me vê uma caixa com trinta salgados")).toEqual([{ quantity: 1, query: "caixa com 30 salgados" }]);
  });

  it("keeps package normalization aligned between customer text and catalog names", () => {
    expect(normalizeProductLanguage("Caixa com 30 salgados")).toBe("uma caixa com 30 salgado");
    expect(normalizeProductLanguage("cx com trinta salgados")).toBe("uma caixa com 30 salgado");
  });
});
