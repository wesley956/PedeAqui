import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const inboxService = readFileSync("src/server/conversations/inbox-intelligence-service.ts", "utf8");
const inboxPage = readFileSync("src/app/(app)/conversas/page.tsx", "utf8");
const actions = readFileSync("src/features/conversations/actions.ts", "utf8");
const outcome = readFileSync("src/server/conversations/inbound-outcome-service.ts", "utf8");
const route = readFileSync("src/app/api/webhooks/whatsapp/route.ts", "utf8");
const migration = readFileSync("supabase/migrations/20260915220000_int12_coexistence_manual_override.sql", "utf8");
const coexistence = readFileSync("src/server/conversations/coexistence-service.ts", "utf8");

describe("INT-12 Inbox/Handoff/Coexistence", () => {
  it("consumes the shared IntelligenceContext for the merchant inbox", () => {
    expect(inboxService).toContain("createIntelligenceContext");
    expect(inboxService).toContain('channel: "merchant_panel"');
    expect(inboxService).toContain('actor: { type: "merchant_user"');
    expect(inboxService).toContain('audience: "agent"');
    expect(inboxService).toContain("mode: detail.conversation.status");
    expect(inboxPage).toContain("InboxIntelligenceService.load");
  });

  it("keeps return-to-bot manual-only with no automatic scheduling", () => {
    expect(inboxService).toContain('returnToBotPolicy: "manual_only"');
    expect(actions).toContain("returnConversationToBotAction");
    expect(actions).toContain('targetState: "bot"');
    expect(migration).toContain("Return to bot remains manual-only");
    expect(migration).not.toMatch(/\bnow\(\)\s*\+\s*interval\b/i);
    expect(migration).not.toMatch(/\bcron\.schedule\b|\bpg_cron\b/i);
  });

  it("pauses bot atomically when WhatsApp Business emits a new echo", () => {
    expect(coexistence).toContain('conversation_receive_echo_internal');
    expect(migration).toContain("trg_conversation_pause_bot_on_business_echo");
    expect(migration).toContain("new.metadata->>'source'");
    expect(migration).toContain("whatsapp_business_app");
    expect(migration).toContain("conversation_transition_internal");
    expect(migration).toContain("'waiting_agent'");
    expect(migration).toContain("'webhook'");
  });

  it("uses insert idempotency so duplicate echoes do not trigger a second override", () => {
    expect(coexistence).toContain("conversation_receive_echo_internal");
    expect(migration).toContain("after insert on public.messages");
    expect(migration).toContain("for each row");
  });

  it("renders unambiguous timeline authorship without changing message bodies", () => {
    expect(inboxService).toContain('return "Cliente"');
    expect(inboxService).toContain('return "WhatsApp Business"');
    expect(inboxService).toContain('return "Robô"');
    expect(inboxService).toContain('return "Atendente PedeAqui"');
    expect(inboxService).toContain('return "Sistema"');
    expect(inboxPage).toContain("message.authorLabel");
  });

  it("guarantees a traceable outcome for unresolved inbound instead of silent bot state", () => {
    expect(route).toContain("InboundOutcomeService.finalize(result)");
    expect(route).toContain("whatsapp.inbound_outcome.failed");
    expect(outcome).toContain('p_target_state: "waiting_agent"');
    expect(outcome).toContain("Inbound sem resposta automática; encaminhado para atendimento");
    expect(outcome).toContain('.eq("direction", "outbound")');
    expect(outcome).not.toContain('if (!result?.message_created) return');
  });

  it("does not create a parallel customer/order/cart state machine", () => {
    expect(inboxService).not.toMatch(/from\(["'](?:carts|orders|customers)["']\)/);
    expect(migration).not.toMatch(/\b(insert|update|delete)\s+(?:into\s+)?public\.(?:carts|orders|customers)\b/i);
  });
});
