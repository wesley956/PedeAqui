import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  priceProductQueryFromInput,
  resolveWhatsAppBotIntent,
} from "@/server/conversations/bot-menu";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("INT-EVOL-01 real WhatsApp regressions", () => {
  it("understands the real colloquial price question without treating social text as price", () => {
    expect(priceProductQueryFromInput("Qto tá os pastéis??")).toBe("pasteis");
    expect(resolveWhatsAppBotIntent("Qto tá os pastéis??", "menu")).toBe("price");
    expect(resolveWhatsAppBotIntent("tá bom", "menu")).not.toBe("price");
  });

  it("preserves the order tracking question across a conversational greeting", () => {
    expect(resolveWhatsAppBotIntent("boa tarde tudo bem", "awaiting_tracking_code")).toBe("track_start");
    expect(resolveWhatsAppBotIntent("90", "awaiting_tracking_code")).toBe("track_code");
    expect(resolveWhatsAppBotIntent("menu", "awaiting_tracking_code")).toBe("menu");
  });

  it("routes price through the canonical Intelligence catalog instead of a parallel price query", () => {
    const source = read("src/server/conversations/greeting-service.ts");
    expect(source).toContain("new IntelligenceCatalogAdapter(intelligenceContext, store.slug)");
    expect(source).toContain('if (intent === "price")');
    expect(source).not.toMatch(/intent === "price"[\s\S]{0,2500}from\("products"\)/);
  });

  it("resolves the inbound intent before deciding whether to send the greeting", () => {
    const source = read("src/server/conversations/greeting-service.ts");
    const intentAt = source.indexOf("const intent = resolveWhatsAppBotIntent");
    const greetingAt = source.indexOf("if (settings.greeting_enabled)");
    expect(intentAt).toBeGreaterThan(-1);
    expect(greetingAt).toBeGreaterThan(intentAt);
    expect(source).toContain('if (intent === "menu" || intent === "unknown")');
  });

  it("does not send fallback/menu for media and does not escalate a simple reaction", () => {
    const greeting = read("src/server/conversations/greeting-service.ts");
    const outcome = read("src/server/conversations/inbound-outcome-service.ts");
    expect(greeting).toContain('inbound.content_type !== "text" && inbound.content_type !== "interactive"');
    expect(outcome).toContain('"ignored_non_actionable"');
    expect(outcome).toContain('whatsappType === "reaction"');
  });
});
