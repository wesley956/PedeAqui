import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  sendText: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock("@/server/conversations/provider", () => ({
  WhatsAppCloudProvider: class {
    sendText = mocks.sendText;
  },
  resolveWhatsAppAccessToken: () => "technical-token",
  safeWhatsAppFailureMessage: () => "provider error",
}));

vi.mock("@/server/growth/customer-benefits", () => ({
  loadCustomerBenefits: vi.fn(),
}));

vi.mock("@/server/growth/growth-observability", () => ({
  recordGrowthOperationalEvent: vi.fn(),
}));

vi.mock("@/server/observability/failure", () => ({
  recordFailure: vi.fn(),
}));

import { ConversationGreetingService } from "@/server/conversations/greeting-service";

function singleRow(data: unknown) {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data, error: null }),
  };
  return query;
}

describe("FLOW-10 B01 safe WhatsApp greeting", () => {
  const previousAppUrl = process.env.APP_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.APP_URL = "https://pedeaqui.example";

    const rows: Record<string, unknown> = {
      conversations: {
        id: "conversation-1",
        organization_id: "organization-1",
        store_id: "store-1",
        contact_id: "contact-1",
        channel: "whatsapp",
        status: "bot",
      },
      store_conversation_settings: {
        whatsapp_enabled: true,
        whatsapp_phone_number_id: "phone-number-1",
        access_token_secret_ref: "secret-ref-1",
        default_bot_enabled: true,
        whatsapp_orders_enabled: true,
        greeting_enabled: true,
        greeting_template: "Oi! Bem-vindo ao {restaurante}. Cardápio: {link}",
        greeting_fallback_message: "O cardápio está indisponível. Vou chamar a equipe.",
        bot_menu_mode: "menu_first",
        bot_display_name: "Assistente Teste",
        handoff_message: "Vou chamar a equipe.",
        unknown_intent_message: "Não consegui entender.",
      },
      contacts: {
        external_id: "5519999991111",
        phone_normalized: "5519999991111",
        customer_id: null,
      },
      stores: {
        name: "Loja Técnica FLOW-10",
        slug: "loja-tecnica-flow10",
        status: "active",
        timezone: "America/Sao_Paulo",
        business_type: "restaurant",
      },
      store_menu_settings: { active: true },
      messages: { body: "Oi", content_type: "text" },
      automation_sessions: null,
    };

    const rpc = vi.fn(async (name: string) => {
      if (name === "conversation_claim_bot_outbound_internal") {
        return { data: { claimed: true, message_id: "outbound-1" }, error: null };
      }
      return { data: null, error: null };
    });

    mocks.createAdminClient.mockReturnValue({
      from: (table: string) => singleRow(rows[table]),
      rpc,
    });
    mocks.sendText.mockResolvedValue({ externalMessageId: "provider-message-1" });
  });

  afterEach(() => {
    if (previousAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = previousAppUrl;
  });

  it("answers Oi with the scoped store identity, canonical menu URL and direct-order option", async () => {
    const observe = vi.fn();

    await ConversationGreetingService.afterInbound({
      conversation_id: "conversation-1",
      message_id: "inbound-1",
      message_created: true,
      conversation_created: true,
    }, "request-1", observe);

    expect(mocks.sendText).toHaveBeenCalledTimes(1);
    expect(mocks.sendText).toHaveBeenCalledWith(expect.objectContaining({
      phoneNumberId: "phone-number-1",
      recipient: "5519999991111",
      body: expect.stringContaining("Loja Técnica FLOW-10"),
    }));
    const body = mocks.sendText.mock.calls[0]?.[0]?.body as string;
    expect(body).toContain("https://pedeaqui.example/m/loja-tecnica-flow10");
    expect(body).toContain("7 — Fazer pedido pelo WhatsApp");
    expect(body).toContain("Assistente Teste");

    const admin = mocks.createAdminClient.mock.results[0]?.value;
    expect(admin.rpc).toHaveBeenCalledWith("automation_session_upsert_internal", expect.objectContaining({
      p_conversation_id: "conversation-1",
      p_step: "menu",
      p_last_input_message_id: "inbound-1",
    }));
    expect(observe).toHaveBeenCalledWith({ intent: "menu", tool: "conversation_info" });
  });
});
