import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

const page = read("src/app/(app)/conversas/page.tsx");
const alertService = read("src/server/conversations/human-attention-alert-service.ts");
const migration = read("supabase/migrations/20260921230000_conversation_customer_attention.sql");
const greeting = read("src/server/conversations/greeting-service.ts");
const orderOrchestrator = read("src/server/conversations/whatsapp-direct-order-orchestrator.ts");
const aiTools = read("src/server/conversations/ai-tools.ts");

describe("#1155 customer-requested human attention", () => {
  it("keeps unread data internally but removes it from the operational Inbox UI", () => {
    expect(migration).toContain("unread_count");
    expect(page).not.toContain("mensagens não lidas");
    expect(page).not.toContain("unreadBadge");
    expect(page).not.toContain("markConversationReadAction");
    expect(page).not.toContain('view: "unread"');
  });

  it("uses a structured customer-attention marker instead of every waiting_agent state", () => {
    expect(migration).toContain("human_attention_requested_at");
    expect(migration).toContain("human_attention_reason_code");
    expect(migration).toContain("conversation_request_human_attention_internal");
    expect(migration).toContain("conversations_clear_human_attention_request_trg");
    expect(alertService).toContain('.eq("status", "waiting_agent")');
    expect(alertService).toContain('.not("human_attention_requested_at", "is", null)');
  });

  it("marks explicit and benefit handoffs without turning technical pauses into customer alerts", () => {
    for (const source of [greeting, orderOrchestrator]) {
      expect(source).toContain('conversation_request_human_attention_internal');
      expect(source).toContain('"benefit_handoff" : "explicit_handoff"');
      expect(source).toContain('conversation_transition_internal');
    }
    expect(aiTools).toContain('conversation_request_human_attention_internal');
    expect(orderOrchestrator).toContain('p_reason: "Falha no envio automático durante pedido pelo WhatsApp"');
    expect(greeting).toContain('p_reason: "Falha no envio automático pelo provedor do WhatsApp"');
  });

  it("clears the customer signal when service leaves the waiting queue", () => {
    expect(migration).toContain("if new.status <> 'waiting_agent'");
    expect(migration).toContain("new.human_attention_requested_at := null");
    expect(migration).toContain("new.human_attention_reason_code := null");
  });

  it("shows a clear customer-request label instead of a numeric unread circle", () => {
    expect(page).toContain("conversation.humanAttentionRequestedAt");
    expect(page).toContain("Cliente pediu atendimento");
    expect(page).toContain("Solicitada pelo cliente");
  });
});
