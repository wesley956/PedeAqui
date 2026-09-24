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

  it("prefers a real outbound before classifying a standalone acknowledgement as intentionally unanswered", () => {
    const source = read("src/server/conversations/inbound-outcome-service.ts");
    const outboundLookupAt = source.indexOf("const { data: outbound");
    const acknowledgementAt = source.indexOf("&& isWhatsAppNonActionableAcknowledgement(inbound.body)");
    const escalationAt = source.indexOf('p_target_state: "waiting_agent"', acknowledgementAt);
    expect(outboundLookupAt).toBeGreaterThan(-1);
    expect(acknowledgementAt).toBeGreaterThan(outboundLookupAt);
    expect(escalationAt).toBeGreaterThan(acknowledgementAt);
    expect(source.slice(acknowledgementAt, escalationAt)).toContain('return "ignored_non_actionable"');
  });

  it("persists the active order draft before moving the conversation to human handoff", () => {
    const source = read("src/server/conversations/whatsapp-direct-order-orchestrator.ts");
    const handoffAt = source.indexOf("if (activeOrderStep && (wantsHuman");
    const nextBlockAt = source.indexOf("if (activeOrderStep && isGrowthBenefitIntent", handoffAt);
    expect(handoffAt).toBeGreaterThan(-1);
    expect(nextBlockAt).toBeGreaterThan(handoffAt);
    const handoffBlock = source.slice(handoffAt, nextBlockAt);
    const saveAt = handoffBlock.indexOf("await saveSession(");
    const transitionAt = handoffBlock.indexOf('await admin.rpc("conversation_request_human_attention_internal"');

    expect(saveAt).toBeGreaterThan(-1);
    expect(transitionAt).toBeGreaterThan(saveAt);
    expect(handoffBlock).toContain('p_reason_code: intent === "benefit_handoff" ? "benefit_handoff" : "explicit_handoff"');
    expect(handoffBlock).toContain("activeOrderStep,");
    expect(handoffBlock).toContain("session?.context as WhatsAppOrderContext");
    expect(handoffBlock).toContain("HUMAN_HANDOFF_ORDER_SESSION_TTL_MINUTES");
    expect(handoffBlock).not.toContain('saveSession(conversation.id, "menu"');
    expect(source).toContain("const HUMAN_HANDOFF_ORDER_SESSION_TTL_MINUTES = 12 * 60");
  });

  it("wires remembered quantity and fragmented address into the existing smart order pipeline", () => {
    const source = read("src/server/conversations/whatsapp-smart-order-service.ts");
    expect(source).toContain("rememberOrderQuantity(input.context, quantity)");
    expect(source).toContain("clearStaleChoicesForExplicitProduct(input.context, input.text)");
    expect(source).toContain("pendingOrderQuantity(choiceSafeContext)");
    expect(source).toContain("`${rememberedQuantity} ${input.text}`");
    expect(source).toContain("pendingAddressParts(input.context)");
    expect(source).toContain("addressPartsFromMessage(input.text)");
    expect(source).toContain("EnhancedWhatsAppOrderService.handle");
  });
});
