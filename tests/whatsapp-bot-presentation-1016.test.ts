import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildWhatsAppBotMenu, resolveWhatsAppBotIntent } from "@/server/conversations/bot-menu";
import { validateBotDisplayName, validateBotReplyMessage, validateGreetingTemplate } from "@/server/conversations/greeting";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("configurable WhatsApp bot presentation [1016]", () => {
  it("keeps text menu available for typed and interactive commands", () => {
    expect(resolveWhatsAppBotIntent("menu", "menu")).toBe("menu");
    expect(resolveWhatsAppBotIntent("Ver opções", "menu")).toBe("menu");
    expect(resolveWhatsAppBotIntent("bot_menu_open", "menu")).toBe("menu");
  });

  it("supports an optional bot name without changing the restaurant identity", () => {
    const menu = buildWhatsAppBotMenu("Dona Maria", true, "Maria");
    expect(menu).toContain("Dona Maria");
    expect(menu).toContain("Eu sou Maria");
    expect(menu).toContain("7 — Fazer pedido pelo WhatsApp");
  });

  it("allows link-free clean greetings but still validates tenant text", () => {
    expect(validateGreetingTemplate("Oi! Estou aqui para ajudar com {restaurante}.", { requireMenuLink: false })).toBe(true);
    expect(validateGreetingTemplate("Oi! Veja {cliente} e fale comigo agora.", { requireMenuLink: false })).toBe(false);
    expect(validateBotDisplayName("Maria")).toBe(true);
    expect(validateBotDisplayName("https://fora.example")).toBe(false);
    expect(validateBotReplyMessage("Vou chamar nossa equipe para ajudar você.")).toBe(true);
  });

  it("persists all three modes and keeps existing stores on menu-first", () => {
    const migration = read("supabase/migrations/20260912051915_whatsapp_bot_presentation_settings.sql");
    expect(migration).toContain("'conversation_first', 'menu_first', 'interactive'");
    expect(migration).toContain("set bot_menu_mode = 'menu_first'");
    expect(migration).toContain("set default 'conversation_first'");
  });

  it("uses a real reply button with deterministic text fallback", () => {
    const provider = read("src/server/conversations/provider.ts");
    const service = read("src/server/conversations/greeting-service.ts");
    expect(provider).toContain('type: "interactive"');
    expect(provider).toContain("buttonId");
    expect(service).toContain('id: "bot_menu_open"');
    expect(service).toContain("whatsapp.bot.interactive_fallback");
    expect(service).toContain("Se quiser ver as opções, digite menu.");
  });

  it("does not disable normal bot intents when greeting is disabled", () => {
    const service = read("src/server/conversations/greeting-service.ts");
    expect(service).not.toContain("if (!settings.greeting_enabled) return");
    expect(service).toContain("if (settings.greeting_enabled)");
  });
});
