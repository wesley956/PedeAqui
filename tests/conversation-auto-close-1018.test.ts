import fs from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  sendText: vi.fn(),
  recordFailure: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }));
vi.mock("@/server/conversations/provider", () => ({
  WhatsAppCloudProvider: class {
    sendText = mocks.sendText;
  },
  resolveWhatsAppAccessToken: () => "resolved-token",
  safeWhatsAppFailureMessage: () => "Falha temporária do WhatsApp.",
}));
vi.mock("@/server/observability/failure", () => ({ recordFailure: mocks.recordFailure }));

import {
  MAX_CONVERSATION_AUTO_CLOSE_MINUTES,
  MIN_CONVERSATION_AUTO_CLOSE_MINUTES,
  validConversationAutoCloseMinutes,
} from "@/server/conversations/conversation-lifecycle";
import { runConversationAutoCloseWorker } from "@/server/conversations/conversation-auto-close-worker";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("conversation auto close [1018]", () => {
  beforeEach(() => {
    mocks.rpc.mockReset();
    mocks.sendText.mockReset();
    mocks.recordFailure.mockReset();
  });

  it("accepts restaurant-defined timeouts only inside the safe range", () => {
    expect(validConversationAutoCloseMinutes(MIN_CONVERSATION_AUTO_CLOSE_MINUTES)).toBe(true);
    expect(validConversationAutoCloseMinutes(30)).toBe(true);
    expect(validConversationAutoCloseMinutes(120)).toBe(true);
    expect(validConversationAutoCloseMinutes(MAX_CONVERSATION_AUTO_CLOSE_MINUTES)).toBe(true);
    expect(validConversationAutoCloseMinutes(4)).toBe(false);
    expect(validConversationAutoCloseMinutes(1441)).toBe(false);
    expect(validConversationAutoCloseMinutes(30.5)).toBe(false);
  });

  it("persists per-store bot/human policies and exposes them in the settings UI", () => {
    const migration = read("supabase/migrations/20260912060536_conversation_auto_close_1018.sql");
    const service = read("src/server/conversations/settings-service.ts");
    const page = read("src/app/(app)/configuracoes/conversas/page.tsx");
    for (const field of [
      "conversation_auto_close_enabled",
      "bot_auto_close_minutes",
      "human_auto_close_minutes",
      "keep_open_while_order_active",
      "send_auto_close_message",
      "auto_close_message",
    ]) expect(migration).toContain(field);
    expect(service).toContain("conversationAutoCloseEnabled");
    expect(service).toContain("keepOpenWhileOrderActive");
    expect(page).toContain("A própria loja escolhe");
    expect(page).toContain("Conversa com o robô");
    expect(page).toContain("Atendimento humano");
  });

  it("revalidates atomically and protects waiting agents, direct orders, active orders and pending sends", () => {
    const migration = read("supabase/migrations/20260912060536_conversation_auto_close_1018.sql").toLowerCase();
    expect(migration).toContain("for update");
    expect(migration).toContain("version_changed");
    expect(migration).toContain("activity_changed");
    expect(migration).toContain("c.status in ('bot', 'human')");
    expect(migration).toContain("whatsapp_order_active");
    expect(migration).toContain("canonical_order_active");
    expect(migration).toContain("outbound_pending");
    expect(migration).toContain("o.order_status not in ('completed','rejected','canceled')");
    expect(migration).toContain("interval '24 hours'");
    expect(migration).toContain("conversation_transition_internal");
  });

  it("expires transient automation context while preserving the closed conversation and its history", () => {
    const migration = read("supabase/migrations/20260912060536_conversation_auto_close_1018.sql").toLowerCase();
    const core = read("supabase/sql/44_conversations_core.sql").toLowerCase();
    expect(migration).toContain("set state = 'expired', context = '{}'::jsonb");
    expect(migration).not.toContain("delete from public.conversations");
    expect(migration).not.toContain("delete from public.conversation_state_history");
    expect(core).toContain("and status <> 'closed'");
    expect(core).toContain("insert into public.conversations");
  });

  it("closes first and sends the optional transactional message without coupling provider success", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: [{ conversation_id: "c-1", expected_version: 7 }], error: null })
      .mockResolvedValueOnce({ data: {
        closed: true,
        conversation_id: "c-1",
        organization_id: "org-1",
        store_id: "store-1",
        message_id: "m-1",
        message_body: "Encerrando por enquanto.",
        recipient: "5511999999999",
        phone_number_id: "phone-1",
        access_token_secret_ref: "WA_TOKEN",
      }, error: null })
      .mockResolvedValueOnce({ data: {}, error: null });
    mocks.sendText.mockResolvedValue({ externalMessageId: "wamid-1" });

    await expect(runConversationAutoCloseWorker()).resolves.toEqual({
      candidates: 1,
      closed: 1,
      messagesSent: 1,
      messageFailures: 0,
      skipped: 0,
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "conversation_auto_close_internal", {
      p_conversation_id: "c-1",
      p_expected_version: 7,
    });
    expect(mocks.rpc).toHaveBeenNthCalledWith(3, "conversation_mark_outbound_result_internal", expect.objectContaining({
      p_message_id: "m-1",
      p_status: "sent",
    }));
  });

  it("keeps the conversation closed when Meta rejects the optional final message", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: [{ conversation_id: "c-2", expected_version: 9 }], error: null })
      .mockResolvedValueOnce({ data: {
        closed: true,
        conversation_id: "c-2",
        organization_id: "org-2",
        store_id: "store-2",
        message_id: "m-2",
        message_body: "Encerrando por enquanto.",
        recipient: "5511888888888",
        phone_number_id: "phone-2",
        access_token_secret_ref: "WA_TOKEN_2",
      }, error: null })
      .mockResolvedValueOnce({ data: {}, error: null });
    mocks.sendText.mockRejectedValue(new Error("window closed"));

    const result = await runConversationAutoCloseWorker();
    expect(result).toMatchObject({ closed: 1, messageFailures: 1 });
    expect(mocks.rpc).toHaveBeenCalledWith("conversation_mark_outbound_result_internal", expect.objectContaining({
      p_message_id: "m-2",
      p_status: "failed",
    }));
  });

  it("registers a protected five-minute scheduler job", () => {
    const migration = read("supabase/migrations/20260912060536_conversation_auto_close_1018.sql");
    const canonical = read("supabase/sql/210_conversation_auto_close.sql");
    const auth = read("src/server/jobs/internal-job-auth.ts");
    expect(migration).toContain("pedeaqui_internal_conversation_auto_close_token");
    expect(migration).toContain("/api/internal/conversation-auto-close");
    expect(migration).toContain("'*/5 * * * *'");
    expect(auth).toContain('"conversation_auto_close"');
    expect(canonical).toBe(migration);
  });
});
