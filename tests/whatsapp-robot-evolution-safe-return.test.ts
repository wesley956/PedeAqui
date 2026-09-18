import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { isWhatsAppNonActionableAcknowledgement } from "@/server/conversations/whatsapp-non-actionable";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

describe("INT-EVOL-02 safe return and non-actionable acknowledgements", () => {
  it("recognizes standalone acknowledgements without swallowing real intents", () => {
    for (const text of ["obrigado", "Obrigada!", "ok", "beleza", "vlw", "tá bom", "até mais"]) {
      expect(isWhatsAppNonActionableAcknowledgement(text)).toBe(true);
    }

    for (const text of [
      "ok quero 20 coxinhas",
      "obrigado onde está meu pedido",
      "beleza me manda o cardápio",
      "tá bom, mas quanto custa o pastel?",
    ]) {
      expect(isWhatsAppNonActionableAcknowledgement(text)).toBe(false);
    }
  });

  it("suppresses greeting/fallback before intent routing for a standalone acknowledgement", () => {
    const source = read("src/server/conversations/greeting-service.ts");
    const acknowledgementAt = source.indexOf("isWhatsAppNonActionableAcknowledgement(inbound.body)");
    const intentAt = source.indexOf("const intent = resolveWhatsAppBotIntent");
    expect(acknowledgementAt).toBeGreaterThan(-1);
    expect(intentAt).toBeGreaterThan(acknowledgementAt);
    expect(source).toContain('observe?.({ intent: "acknowledgement", tool: "conversation_info" })');
  });

  it("classifies an intentionally unanswered acknowledgement as ignored instead of escalating it", () => {
    const source = read("src/server/conversations/inbound-outcome-service.ts");
    const acknowledgementAt = source.indexOf("isWhatsAppNonActionableAcknowledgement(inbound.body)");
    const outboundLookupAt = source.indexOf('admin.from("messages")', acknowledgementAt);
    expect(acknowledgementAt).toBeGreaterThan(-1);
    expect(outboundLookupAt).toBeGreaterThan(acknowledgementAt);
    expect(source.slice(acknowledgementAt, outboundLookupAt)).toContain('return "ignored_non_actionable"');
  });

  it("preserves the active order step and draft context during human handoff", () => {
    const source = read("src/server/conversations/whatsapp-direct-order-orchestrator.ts");
    const handoffAt = source.indexOf("if (activeOrderStep && (wantsHuman");
    const nextBlockAt = source.indexOf("if (activeOrderStep && isGrowthBenefitIntent", handoffAt);
    expect(handoffAt).toBeGreaterThan(-1);
    expect(nextBlockAt).toBeGreaterThan(handoffAt);
    const handoffBlock = source.slice(handoffAt, nextBlockAt);

    expect(handoffBlock).toContain("p_target_state: \"waiting_agent\"");
    expect(handoffBlock).toContain("activeOrderStep,");
    expect(handoffBlock).toContain("session?.context as WhatsAppOrderContext");
    expect(handoffBlock).toContain("HUMAN_HANDOFF_ORDER_SESSION_TTL_MINUTES");
    expect(handoffBlock).not.toContain('saveSession(conversation.id, "menu"');
    expect(source).toContain("const HUMAN_HANDOFF_ORDER_SESSION_TTL_MINUTES = 12 * 60");
  });
});
