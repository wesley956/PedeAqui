import { describe, expect, it } from "vitest";
import { parseOrderComposition } from "@/server/conversations/whatsapp-order-context";
import { normalizeInformalPortuguese } from "@/server/conversations/language-normalization";

describe("WhatsApp inline composition regression", () => {
  it("extracts composition embedded after the package description", () => {
    const composition = parseOrderComposition("Quero um copo do. 30 unidades de salgado cm 15 coz inha e 15 queijo");
    expect(composition?.total).toBe(30);
    expect(composition?.parts).toHaveLength(2);
    expect(composition?.parts[0]?.quantity).toBe(15);
    expect(composition?.parts[0]?.normalizedLabel).toContain("coxinha");
    expect(composition?.parts[1]?.quantity).toBe(15);
    expect(composition?.parts[1]?.normalizedLabel).toContain("queijo");
  });

  it("normalizes spaced misspellings seen in real WhatsApp messages", () => {
    expect(normalizeInformalPortuguese("15 coz inha e 15 qjo")).toContain("15 coxinha");
    expect(normalizeInformalPortuguese("15 coz inha e 15 qjo")).toContain("15 queijo");
  });
});
