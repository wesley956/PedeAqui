import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeBotInput } from "@/server/conversations/bot-menu";
import { normalizeProductLanguage } from "@/server/conversations/language-normalization";
import { pixPaymentGuidanceMessage } from "@/server/conversations/whatsapp-payment-guidance";

describe("PedeAqui-wide WhatsApp architecture hardening", () => {
  it("keeps product vocabulary out of global intent normalization", () => {
    expect(normalizeBotInput("cozinha")).toBe("cozinha");
    expect(normalizeBotInput("Meni")).toBe("menu");
    expect(normalizeProductLanguage("coxina")).toBe("coxinha");
  });

  it("does not globally claim that Pix is accepted or map Pix to cash", () => {
    const message = pixPaymentGuidanceMessage().toLowerCase();
    expect(message).not.toContain("você pode pagar via pix");
    expect(message).not.toContain("1 — dinheiro");
    expect(message).toContain("esta loja");
  });

  it("does not leak Dona Maria product examples into the global quantity fallback", () => {
    const source = readFileSync(join(process.cwd(), "src/server/conversations/whatsapp-smart-order-service.ts"), "utf8").toLowerCase();
    expect(source).not.toContain("salgados");
    expect(source).not.toContain("mini churros");
    expect(source).not.toContain("pastéis");
    expect(source).toContain("produto do cardápio desta loja");
  });
});
