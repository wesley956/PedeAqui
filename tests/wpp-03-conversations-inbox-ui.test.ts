import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/app/(app)/conversas/page.tsx", "utf8");
const styles = readFileSync("src/app/(app)/conversas/conversations.module.css", "utf8");

describe("WPP-03 Conversations Inbox UI", () => {
  it("keeps conversation selection in the URL instead of forcing the first row", () => {
    expect(page).toContain("const selectedRow = params.conversation");
    expect(page).not.toContain(": inbox.conversations[0]");
    expect(page).toContain('data-selected={detail ? "true" : undefined}');
    expect(page).toContain('aria-label="Voltar para conversas"');
    expect(page).toContain("filterHref(inbox.filter)");
  });

  it("renders the operational three-area workspace without a parallel customer/order state", () => {
    expect(page).toContain("styles.inboxPanel");
    expect(page).toContain("styles.thread");
    expect(page).toContain("styles.contextPanel");
    expect(page).toContain("detail.subject.customerId");
    expect(page).toContain("detail.intelligenceContext.activeReferences.orderId");
    expect(page).not.toMatch(/from\(["'](?:customers|orders|carts)["']\)/);
  });

  it("preserves the INT-12 authorship and manual handoff contracts", () => {
    expect(page).toContain("InboxIntelligenceService.load");
    expect(page).toContain("message.authorLabel");
    expect(page).toContain("authorKey(message.authorLabel)");
    expect(page).toContain("assumeConversationAction");
    expect(page).toContain("queueConversationAction");
    expect(page).toContain("returnConversationToBotAction");
    expect(page).toContain("sendConversationMessageAction");
    expect(page).toContain("o retorno ao robô é manual");
  });

  it("uses three columns on wide screens and list-to-thread navigation on mobile", () => {
    expect(styles).toContain("grid-template-columns:minmax(280px,330px) minmax(420px,1fr) minmax(230px,290px)");
    expect(styles).toContain('@media(max-width:760px)');
    expect(styles).toContain('.workspace[data-selected="true"] .inboxPanel{display:none}');
    expect(styles).toContain('.workspace:not([data-selected="true"]) .thread{display:none}');
    expect(styles).toContain(".mobileBack{display:grid}");
  });

  it("keeps accessibility and reduced-motion protections", () => {
    expect(page).toContain('aria-label="Lista de conversas"');
    expect(page).toContain('aria-label="Histórico da conversa"');
    expect(page).toContain('aria-label="Contexto do atendimento"');
    expect(styles).toContain("@media(prefers-reduced-motion:reduce)");
    expect(styles).toContain("env(safe-area-inset-bottom)");
  });
});
