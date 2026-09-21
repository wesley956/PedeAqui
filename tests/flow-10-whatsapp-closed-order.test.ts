import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  loadOperationalStatus: vi.fn(),
  orderHandle: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: mocks.createAdminClient,
}));

vi.mock("@/server/menu/store-operational-status", () => ({
  StoreOperationalStatusService: { load: mocks.loadOperationalStatus },
  storeClosedOrderMessage: () => "A loja está fechada agora. Voltamos às 18h.",
  storeOperationalHoursMessage: () => "Horário indisponível.",
}));

vi.mock("@/server/conversations/whatsapp-smart-order-service", () => ({
  isWhatsAppOrderStep: () => false,
  looksLikeWhatsAppOrderItems: () => false,
  WhatsAppOrderService: { handle: mocks.orderHandle },
  whatsappOrderStartMessage: () => "Vamos começar seu pedido.",
}));

vi.mock("@/server/conversations/provider", () => ({
  WhatsAppCloudProvider: class {},
  resolveWhatsAppAccessToken: () => "unused",
  safeWhatsAppFailureMessage: () => "provider error",
}));

vi.mock("@/server/conversations/whatsapp-customer-context", () => ({
  asksAboutSavedAddress: () => false,
  asksForTrackingNumberHelp: () => false,
  formatSavedAddress: () => "",
  loadRecentOwnedOrderNumbers: vi.fn(),
  loadWhatsAppSavedAddresses: vi.fn(),
}));

vi.mock("@/server/growth/customer-benefits", () => ({
  loadCustomerBenefits: vi.fn(),
}));

vi.mock("@/server/observability/failure", () => ({
  recordFailure: vi.fn(),
}));

import { WhatsAppDirectOrderOrchestrator } from "@/server/conversations/whatsapp-direct-order-orchestrator";

function singleRow(data: unknown) {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data, error: null }),
  };
  return query;
}

describe("FLOW-10 C02 closed-store WhatsApp safety", () => {
  beforeEach(() => {
    vi.clearAllMocks();

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
        whatsapp_orders_enabled: true,
        whatsapp_enabled: true,
        whatsapp_phone_number_id: "phone-number-1",
        access_token_secret_ref: "secret-ref-1",
        default_bot_enabled: true,
        bot_display_name: "Dona Maria",
        handoff_message: "Vou chamar alguém.",
      },
      contacts: {
        external_id: "5519999999999",
        phone_normalized: "5519999999999",
        name: "Cliente Teste",
        customer_id: null,
      },
      stores: {
        name: "Dona Maria",
        slug: "dona-maria-test",
        status: "active",
        timezone: "America/Sao_Paulo",
      },
      messages: { body: "Quero pedir", content_type: "text" },
      automation_sessions: null,
    };

    const rpc = vi.fn(async (name: string) => {
      if (name === "conversation_claim_bot_outbound_internal") {
        return { data: { claimed: false, message_id: "outbound-1" }, error: null };
      }
      return { data: null, error: null };
    });

    mocks.createAdminClient.mockReturnValue({
      from: (table: string) => singleRow(rows[table]),
      rpc,
    });
    mocks.loadOperationalStatus.mockResolvedValue({ canOrder: false });
  });

  it("blocks 'Quero pedir' before the order service can create or mutate a checkout", async () => {
    const observe = vi.fn();

    const handled = await WhatsAppDirectOrderOrchestrator.afterInbound({
      conversation_id: "conversation-1",
      message_id: "inbound-1",
      message_created: true,
    }, "request-1", observe);

    expect(handled).toBe(true);
    expect(mocks.loadOperationalStatus).toHaveBeenCalledWith({
      organizationId: "organization-1",
      storeId: "store-1",
    });
    expect(mocks.orderHandle).not.toHaveBeenCalled();
    expect(observe).toHaveBeenCalledWith({ intent: "order_start", tool: "whatsapp_order" });
  });
});
