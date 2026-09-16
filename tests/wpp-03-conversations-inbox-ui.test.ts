import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/app/(app)/conversas/page.tsx", "utf8");
const styles = readFileSync("src/app/(app)/conversas/conversations.module.css", "utf8");
const shell = readFileSync("src/app/shell-v3.css", "utf8");

describe("WPP-03 Conversations Inbox UI", () => {
  it("keeps conversation selection in the URL instead of forcing the first row", () => {
    expect(page).toContain("const selectedRow = params.conversation");
    expect(page).not.toContain(": inbox.conversations[0]");
    expect(page).toContain('data-selected={detail ? "true" : undefined}');
    expect(page).toContain('aria-label="Voltar para conversas"');
    expect(page).toContain("inboxHref({");
  });

  it("renders the operational three-area workspace without inventing order state", () => {
    expect(page).toContain("styles.inboxPanel");
    expect(page).toContain("styles.thread");
    expect(page).toContain("styles.contextPanel");
    expect(page).toContain("InboxContextService.load");
    expect(page).toContain("detailContext.linkedCustomerId");
    expect(page).not.toContain("detail.intelligenceContext.activeReferences.orderId");
    expect(page).not.toContain("Nenhum pedido ativo está projetado");
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

  it("uses the available desktop viewport and keeps scrolling inside operational areas", () => {
    expect(styles).toContain("grid-template-columns:minmax(270px,320px) minmax(420px,1fr) minmax(220px,270px)");
    expect(styles).toContain(".inboxList{min-height:0;overflow-y:auto;overflow-x:hidden");
    expect(styles).toContain(".messages{min-height:0;overflow-y:auto;overflow-x:hidden");
    expect(styles).toContain(".contextPanel{min-width:0;min-height:0;height:100%;overflow:hidden");
    expect(shell).toContain(".app-main:has(.conversations-workspace-route){height:100dvh;display:flex;flex-direction:column;overflow:hidden}");
    expect(shell).toContain("max-width:none");
  });

  it("keeps the composer visible as the final fixed grid row", () => {
    expect(styles).toContain("grid-template-rows:auto minmax(0,1fr) auto");
    expect(styles).toContain(".composer{");
    expect(page).toContain('placeholder="Digite uma mensagem"');
    expect(page).toContain("Esta conversa está com outro usuário");
  });

  it("adds search and unread filtering without a parallel client-side state machine", () => {
    expect(page).toContain('placeholder="Buscar nome ou telefone"');
    expect(page).toContain('params.view === "unread"');
    expect(page).toContain("visibleConversations");
    expect(page).toContain("mensagens não lidas");
    expect(styles).toContain(".filters{display:flex;gap:5px;flex-wrap:wrap;overflow:visible}");
  });

  it("sanitizes visual labels and emoji initials", () => {
    expect(page).toContain("function avatarInitial");
    expect(page).toContain("Array.from(normalized)");
    expect(page).toContain("function deliveryLabel");
    expect(page).toContain('read: "lida"');
    expect(page).toContain('status === "bot" ? "Robô"');
  });

  it("uses three areas on wide screens and list-to-thread navigation on mobile", () => {
    expect(styles).toContain("@media(max-width:760px)");
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
