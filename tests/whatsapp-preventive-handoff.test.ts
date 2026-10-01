import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ admin: vi.fn(), sendText: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/server/conversations/provider", () => ({
  WhatsAppCloudProvider: class {
    sendText = mocks.sendText;
  },
  resolveWhatsAppAccessToken: () => "technical-token",
  safeWhatsAppFailureMessage: () => "provider failure",
}));
import { isPreventiveHandoffEnabled, requestPreventiveHandoff } from "@/server/conversations/whatsapp-preventive-handoff";
import { ConversationGreetingService } from "@/server/conversations/greeting-service";
import { WhatsAppDirectOrderOrchestrator } from "@/server/conversations/whatsapp-direct-order-orchestrator";

import { UnifiedIntelligenceRouterShadow } from "@/server/intelligence/unified-router-shadow";
import { buildIntelligenceShadowObservation } from "@/server/intelligence/shadow-observability";

beforeEach(() => {
  vi.stubEnv("WHATSAPP_NON_COMMERCIAL_HANDOFF_STORES", "11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222");
  mocks.sendText.mockReset();
});
afterEach(() => { vi.unstubAllEnvs(); });

function query(data: unknown) {
  const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data, error: null }) };
  return q;
}
for (const handler of [ConversationGreetingService, WhatsAppDirectOrderOrchestrator]) {
  describe(`${handler.name} preventive handoff`, () => {
    for (const state of ["bot", "human", "waiting_agent"] as const) {
      for (const draft of [false, true]) {
        it(`blocks commercial effects in ${state}, draft=${draft}`, async () => {
          const session = draft ? { state: "active", step: "order_payment", context: { channel: "whatsapp_order", cartToken: "technical-cart" } } : null;
          const rows: Record<string, unknown> = {
            conversations: { id: "33333333-3333-4333-8333-333333333333", organization_id: "11111111-1111-4111-8111-111111111111", store_id: "22222222-2222-4222-8222-222222222222", contact_id: "44444444-4444-4444-8444-444444444444", channel: "whatsapp", status: state },
            store_conversation_settings: { intelligence_shadow_mode: true, default_bot_enabled: true, whatsapp_enabled: true, whatsapp_orders_enabled: true, whatsapp_phone_number_id: "pn", access_token_secret_ref: "secret" },
            contacts: { external_id: "technical-contact" },
            stores: { name: "Technical", slug: "technical", status: "active", business_type: "restaurant" },
            store_menu_settings: { active: true },
            messages: { body: "vendo caixas 15x15x7: 30 unidades", content_type: "text" },
            automation_sessions: session,
          };
          const rpc = vi.fn(async () => ({ data: { status: "waiting_agent" }, error: null }));
          const from = vi.fn((table: string) => {
            if (!(table in rows)) throw new Error(`Unexpected commercial access ${table}`);
            return query(rows[table]);
          });
          mocks.admin.mockReturnValue({ from, rpc });
          const before = JSON.stringify(session);
          const inbound = { conversation_id: "33333333-3333-4333-8333-333333333333", message_id: "55555555-5555-4555-8555-555555555555", message_created: true };
          const shadow = await UnifiedIntelligenceRouterShadow.afterInbound(inbound, "technical");
          const observe = vi.fn();
          await handler.afterInbound(inbound, "technical", observe);
          expect(shadow).not.toBeNull();
          const comparison = buildIntelligenceShadowObservation(shadow!, {
            legacyHandler: state === "bot" ? (handler === ConversationGreetingService ? "greeting" : "whatsapp_order") : "none",
            legacyDecision: observe.mock.calls[0]?.[0] ?? null,
            legacyOutcome: state === "bot" ? "waiting_agent" : state,
            legacyDurationMs: 1,
          });
          expect(comparison.critical_mismatch).toBe(false);
          expect(comparison.comparisons.handoff).toBe("match");
          expect(JSON.stringify(session)).toBe(before);
          if (state === "bot") {
            expect(rpc.mock.calls).toEqual([["conversation_preventive_handoff_internal", {
              p_organization_id: "11111111-1111-4111-8111-111111111111", p_store_id: "22222222-2222-4222-8222-222222222222", p_conversation_id: "33333333-3333-4333-8333-333333333333", p_message_id: "55555555-5555-4555-8555-555555555555", p_reason_code: "supplier_contact",
            }]]);
          } else expect(rpc).not.toHaveBeenCalled();
        });
      }
    }
    it("fails closed when atomic handoff fails", async () => {
      const rows: Record<string, unknown> = {
        conversations: { id: "33333333-3333-4333-8333-333333333333", organization_id: "11111111-1111-4111-8111-111111111111", store_id: "22222222-2222-4222-8222-222222222222", channel: "whatsapp", status: "bot" },
        store_conversation_settings: { intelligence_shadow_mode: true, default_bot_enabled: true, whatsapp_enabled: true, whatsapp_orders_enabled: true, whatsapp_phone_number_id: "pn", access_token_secret_ref: "secret" },
        contacts: { external_id: "technical" }, stores: { name: "Technical", slug: "technical" },
        messages: { body: "vaga de freelance", content_type: "text" }, automation_sessions: null,
      };
      const error = new Error("RPC unavailable");
      const rpc = vi.fn(async () => ({ data: null, error }));
      mocks.admin.mockReturnValue({ from: (t: string) => query(rows[t]), rpc });
      await expect(handler.afterInbound({ conversation_id: "33333333-3333-4333-8333-333333333333", message_id: "55555555-5555-4555-8555-555555555555" }, "technical")).rejects.toBe(error);
      expect(rpc).toHaveBeenCalledTimes(1);
    });
  });
}

describe("preventive handoff transition notice", () => {
  const input = {
    organizationId: "11111111-1111-4111-8111-111111111111",
    storeId: "22222222-2222-4222-8222-222222222222",
    conversationId: "33333333-3333-4333-8333-333333333333",
    messageId: "55555555-5555-4555-8555-555555555555",
    reason: "supplier_contact" as const,
  };

  it("sends the configured notice once after an applied handoff", async () => {
    const rows: Record<string, unknown> = {
      conversations: { contact_id: "44444444-4444-4444-8444-444444444444" },
      store_conversation_settings: {
        handoff_message: "Certo! Encaminhei sua conversa para a equipe do restaurante.",
        whatsapp_phone_number_id: "pn",
        access_token_secret_ref: "secret",
      },
      contacts: { external_id: "5511999999999" },
    };
    const rpc = vi.fn(async (name: string) => {
      if (name === "conversation_claim_bot_outbound_internal") return { data: { claimed: true, message_id: "66666666-6666-4666-8666-666666666666" }, error: null };
      if (name === "conversation_preventive_handoff_internal") return { data: { status: "waiting_agent" }, error: null };
      if (name === "conversation_mark_outbound_result_internal") return { data: {}, error: null };
      throw new Error(`Unexpected RPC ${name}`);
    });
    mocks.admin.mockReturnValue({ from: (table: string) => query(rows[table]), rpc });
    mocks.sendText.mockResolvedValue({ externalMessageId: "wamid.notice" });

    await requestPreventiveHandoff(input, rpc);

    expect(mocks.sendText).toHaveBeenCalledTimes(1);
    expect(mocks.sendText).toHaveBeenCalledWith({
      phoneNumberId: "pn",
      recipient: "5511999999999",
      body: "Certo! Encaminhei sua conversa para a equipe do restaurante.",
    });
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "conversation_claim_bot_outbound_internal",
      "conversation_preventive_handoff_internal",
      "conversation_mark_outbound_result_internal",
    ]);
  });

  it("does not send a notice when a concurrent human owner wins", async () => {
    const rows: Record<string, unknown> = {
      conversations: { contact_id: "44444444-4444-4444-8444-444444444444" },
      store_conversation_settings: {
        handoff_message: "Encaminhei para a equipe.",
        whatsapp_phone_number_id: "pn",
        access_token_secret_ref: "secret",
      },
      contacts: { external_id: "5511999999999" },
    };
    const rpc = vi.fn(async (name: string) => {
      if (name === "conversation_claim_bot_outbound_internal") return { data: { claimed: true, message_id: "66666666-6666-4666-8666-666666666666" }, error: null };
      if (name === "conversation_preventive_handoff_internal") return { data: { status: "human" }, error: null };
      if (name === "conversation_mark_outbound_result_internal") return { data: {}, error: null };
      throw new Error(`Unexpected RPC ${name}`);
    });
    mocks.admin.mockReturnValue({ from: (table: string) => query(rows[table]), rpc });

    await requestPreventiveHandoff(input, rpc);

    expect(mocks.sendText).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenLastCalledWith("conversation_mark_outbound_result_internal", expect.objectContaining({
      p_status: "failed",
      p_error_code: "handoff_not_applied",
    }));
  });
});

describe("preventive handoff rollout scope", () => {
  const org = "11111111-1111-4111-8111-111111111111";
  const store = "22222222-2222-4222-8222-222222222222";
  it("is OFF by default and rejects wildcards/malformed scopes", () => {
    for (const config of ["", "*", store, `${org}:*`, "true"]) expect(isPreventiveHandoffEnabled(org, store, config)).toBe(false);
  });
  it("enables only the exact organization/store pair", () => {
    const config = ` ${org}:${store} `;
    expect(isPreventiveHandoffEnabled(org, store, config)).toBe(true);
    expect(isPreventiveHandoffEnabled("33333333-3333-4333-8333-333333333333", store, config)).toBe(false);
    expect(isPreventiveHandoffEnabled(org, "44444444-4444-4444-8444-444444444444", config)).toBe(false);
  });
});
