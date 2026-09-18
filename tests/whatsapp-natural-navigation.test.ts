import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveWhatsAppBotIntent } from "@/server/conversations/bot-menu";
import { isExplicitMenuNavigation } from "@/server/conversations/whatsapp-navigation";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("INT-EVOL-03 natural WhatsApp navigation", () => {
  it("recognizes real-world requests to return or restart", () => {
    for (const text of [
      "menu",
      "voltar as opcoes",
      "voltar às opções",
      "voltar ao menu",
      "certo quero voltar do inicio",
      "quero voltar ao início",
      "começar de novo",
      "reiniciar",
    ]) {
      expect(isExplicitMenuNavigation(text)).toBe(true);
      expect(resolveWhatsAppBotIntent(text, "menu")).toBe("menu");
    }
  });

  it("does not confuse catalog questions or greetings with an explicit order reset", () => {
    for (const text of [
      "qual é o cardápio?",
      "tem caixa?",
      "quero saber se tem caixas de salgado",
      "oi",
      "boa noite",
    ]) {
      expect(isExplicitMenuNavigation(text)).toBe(false);
    }
  });

  it("uses the same explicit navigation rule inside an active order and clears only transient session context", () => {
    const source = read("src/server/conversations/whatsapp-direct-order-orchestrator.ts");
    expect(source).toContain("activeOrderStep && isExplicitMenuNavigation(inbound.body)");
    expect(source).toContain('saveSession(conversation.id, "menu", ingest.message_id, null)');
    expect(source).toContain('observe?.({ intent: "menu", tool: "conversation_info" })');
  });
});
