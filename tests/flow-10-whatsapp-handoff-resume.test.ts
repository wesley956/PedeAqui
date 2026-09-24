import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  sendText: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock("@/server/conversations/provider", () => ({
  WhatsAppCloudProvider: class { sendText = mocks.sendText; },
  resolveWhatsAppAccessToken: () => "technical-token",
  safeWhatsAppFailureMessage: () => "provider error",
}));
vi.mock("@/server/conversations/whatsapp-smart-order-service", () => ({
  isWhatsAppOrderStep: (step: string) => [
    "order_items", "order_name", "order_fulfillment", "order_address", "order_payment", "order_confirmation",
  ].includes(step),
  looksLikeWhatsAppOrderItems: () => false,
  WhatsAppOrderService: { handle: vi.fn() },
  whatsappOrderStartMessage: () => "Início técnico",
}));
vi.mock("@/server/growth/customer-benefits", () => ({ loadCustomerBenefits: vi.fn() }));
vi.mock("@/server/observability/failure", () => ({ recordFailure: vi.fn() }));

import { resolveBotResumeSession } from "@/server/conversations/conversation-bot-resume-policy";
import { WhatsAppDirectOrderOrchestrator } from "@/server/conversations/whatsapp-direct-order-orchestrator";

function singleRow(data: unknown) {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data, error: null }),
  };
  return query;
}

describe("FLOW-10 B10/D12 human handoff and safe resume", () => {
  const savedContext = {
    channel: "whatsapp_order" as const,
    version: 1 as const,
    cartToken: "flow10-resumable-cart",
    customerName: "Cliente Técnico",
    fulfillment: "pickup" as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sendText.mockResolvedValue({ externalMessageId: "technical-provider-message" });

    const rows: Record<string, unknown> = {
      conversations: {
        id: "conversation-technical",
        organization_id: "organization-technical",
        store_id: "store-technical",
        contact_id: "contact-technical",
        channel: "whatsapp",
        status: "bot",
      },
      store_conversation_settings: {
        whatsapp_orders_enabled: true,
        whatsapp_enabled: true,
        whatsapp_phone_number_id: "phone-number-technical",
        access_token_secret_ref: "secret-ref-technical",
        default_bot_enabled: true,
        bot_display_name: "Assistente Técnico",
        handoff_message: "A equipe técnica continuará daqui.",
      },
      contacts: {
        external_id: "5500000000000",
        phone_normalized: "5500000000000",
        name: "Cliente Técnico",
        customer_id: "customer-technical",
      },
      stores: {
        name: "Loja Técnica",
        slug: "flow10-technical-store",
        status: "active",
        timezone: "America/Sao_Paulo",
      },
      messages: { body: "quero falar com atendente", content_type: "text" },
      automation_sessions: {
        step: "order_payment",
        state: "active",
        context: savedContext,
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      },
    };

    const rpc = vi.fn(async (name: string) => {
      if (name === "conversation_claim_bot_outbound_internal") {
        return { data: { claimed: true, message_id: "outbound-technical" }, error: null };
      }
      return { data: null, error: null };
    });
    const admin = { from: (table: string) => singleRow(rows[table]), rpc };
    mocks.createAdminClient.mockReturnValue(admin);
  });

  it("B10 saves the exact checkout context before moving the conversation to waiting_agent", async () => {
    const observe = vi.fn();
    const handled = await WhatsAppDirectOrderOrchestrator.afterInbound({
      conversation_id: "conversation-technical",
      message_id: "inbound-technical",
      message_created: true,
    }, "request-technical", observe);

    expect(handled).toBe(true);
    const admin = mocks.createAdminClient.mock.results[0]?.value;
    const calls = admin.rpc.mock.calls as Array<[string, Record<string, unknown>]>;
    const saveIndex = calls.findIndex(([name]) => name === "automation_session_upsert_internal");
    const transitionIndex = calls.findIndex(([name]) => name === "conversation_request_human_attention_internal");
    expect(saveIndex).toBeGreaterThan(-1);
    expect(transitionIndex).toBeGreaterThan(saveIndex);
    expect(calls[saveIndex]?.[1]).toMatchObject({
      p_conversation_id: "conversation-technical",
      p_step: "order_payment",
      p_context: savedContext,
      p_last_input_message_id: "inbound-technical",
    });
    const expiresAt = Date.parse(String(calls[saveIndex]?.[1]?.p_expires_at));
    expect(expiresAt).toBeGreaterThan(Date.now() + 11 * 60 * 60 * 1000);
    expect(calls[transitionIndex]?.[1]).toMatchObject({
      p_conversation_id: "conversation-technical",
      p_reason_code: "explicit_handoff",
      p_source: "bot",
    });
    expect(mocks.sendText).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.stringContaining("mantive a montagem do seu pedido salva"),
    }));
    expect(observe).toHaveBeenCalledWith({ intent: "handoff", tool: "human_handoff" });
  });

  it("D12 resumes the preserved step only while the canonical cart remains active", () => {
    const session = {
      state: "active",
      step: "order_payment",
      context: savedContext,
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
    };
    expect(resolveBotResumeSession({
      session,
      nowMs: Date.now(),
      cartActive: true,
      cartConvertedToOrder: false,
    })).toEqual({ mode: "preserve", reason: "preserve_order_step" });
    expect(resolveBotResumeSession({
      session,
      nowMs: Date.now(),
      cartActive: false,
      cartConvertedToOrder: true,
    })).toEqual({ mode: "safe_menu", reason: "cart_already_converted" });
  });
});
