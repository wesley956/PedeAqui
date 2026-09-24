import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  sendText: vi.fn(),
  loadCapability: vi.fn(),
  resolveRecipient: vi.fn(),
  recordGrowth: vi.fn(),
}));

const organizationId = "74000000-0000-4000-8000-000000000001";
const storeId = "74000000-0000-4000-8000-000000000002";
const orderId = "74000000-0000-4000-8000-000000000003";
const eventId = "74000000-0000-4000-8000-000000000004";
const notificationJobId = "74000000-0000-4000-8000-000000000005";
const trackingToken = "flow10-technical-tracking-token";

function row(data: unknown) {
  const query = {
    select: () => query,
    eq: () => query,
    order: () => query,
    limit: () => query,
    maybeSingle: async () => ({ data, error: null }),
  };
  return query;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: mocks.rpc,
    from: (table: string) => {
      const rows: Record<string, unknown> = {
        orders: {
          id: orderId,
          organization_id: organizationId,
          store_id: storeId,
          display_number: 742,
          fulfillment_type: "delivery",
          order_status: "confirmed",
          customer_id: "74000000-0000-4000-8000-000000000006",
          customer_name_snapshot: "Cliente Técnico",
          customer_phone_snapshot: "5500000000000",
        },
        store_conversation_settings: {
          whatsapp_enabled: true,
          connection_status: "connected",
          whatsapp_phone_number_id: "technical-phone-number-id",
          access_token_secret_ref: "technical-secret-ref",
          app_secret_secret_ref: "technical-app-secret-ref",
          order_notifications_enabled: true,
          notify_order_received: true,
          notify_order_confirmed: true,
          notify_production_preparing: true,
          notify_payment_paid: true,
          notify_pickup_ready: true,
          notify_pickup_completed: true,
          notify_out_for_delivery: true,
          notify_delivered: true,
          notify_order_canceled: true,
          order_notification_custom_templates: null,
          order_notification_template_name: null,
          order_notification_template_language: "pt_BR",
        },
        stores: { name: "Loja Técnica FLOW-10", slug: "flow10-technical-store", status: "active" },
        order_notification_contexts: { tracking_access_token: trackingToken },
        messages: { created_at: new Date().toISOString() },
      };
      return row(rows[table] ?? null);
    },
  }),
}));

vi.mock("@/server/conversations/whatsapp-automation-capability", () => ({
  resolveWhatsAppAutomationCapabilities: () => ({ out_for_delivery: { state: "enabled" } }),
  automationCanDispatch: (capability: { state: string }) => capability.state === "enabled",
}));

vi.mock("@/server/conversations/whatsapp-automation-capability-service", () => ({
  WhatsAppAutomationCapabilityService: { loadForStore: mocks.loadCapability },
}));

vi.mock("@/server/conversations/order-recipient-resolver", () => ({
  resolveOrderRecipient: mocks.resolveRecipient,
}));

vi.mock("@/server/conversations/order-workflow-visibility", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/conversations/order-workflow-visibility")>();
  return {
    ...actual,
    resolveNotificationWorkflowVisibility: () => ({ eligible: true, checkpoint: "out_for_delivery" }),
  };
});

vi.mock("@/server/conversations/provider", () => ({
  WhatsAppProviderError: class WhatsAppProviderError extends Error {},
  resolveWhatsAppAccessToken: () => "technical-access-token",
  WhatsAppCloudProvider: class {
    sendText = mocks.sendText;
  },
}));

vi.mock("@/server/observability/failure", () => ({ recordFailure: vi.fn() }));
vi.mock("@/server/growth/growth-observability", () => ({
  recordGrowthOperationalEvent: mocks.recordGrowth,
}));

import { buildOrderLookupMessage } from "@/server/conversations/bot-menu";
import { runOrderWhatsAppNotificationWorker } from "@/server/conversations/order-notification-worker";
import { projectOrderTrackingState } from "@/server/conversations/order-tracking-projection";

describe("FLOW-10 B09 WhatsApp and tracking identity", () => {
  const previousAppUrl = process.env.APP_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.APP_URL = "https://pedeaqui.example";
    mocks.loadCapability.mockResolvedValue({
      businessType: "restaurant",
      modules: {},
      onlinePaymentReady: true,
      deliveryOperationEnabled: true,
      workflowEligibility: {},
      workflowSettings: {},
    });
    mocks.resolveRecipient.mockResolvedValue({ ok: true, phoneNormalized: "5500000000000" });
    mocks.sendText.mockResolvedValue({ externalMessageId: "technical-provider-message" });
    mocks.recordGrowth.mockResolvedValue(undefined);
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "order_notification_claim_for_order_internal") return {
        data: [{
          id: notificationJobId,
          organization_id: organizationId,
          store_id: storeId,
          order_id: orderId,
          domain_event_id: eventId,
          notification_type: "out_for_delivery",
          attempts: 1,
        }],
        error: null,
      };
      if (name === "conversation_resolve_outbound_internal") return {
        data: { conversation_id: "technical-conversation", external_id: "5500000000000" },
        error: null,
      };
      if (name === "order_notification_claim_workflow_checkpoint_internal") return { data: true, error: null };
      if (name === "conversation_create_outbound_internal") return {
        data: { id: "technical-outbound-message", delivery_status: "pending" },
        error: null,
      };
      return { data: null, error: null };
    });
  });

  afterEach(() => {
    if (previousAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = previousAppUrl;
  });

  it("dispatches the technical job and exposes the same order and public stage in tracking", async () => {
    const result = await runOrderWhatsAppNotificationWorker({
      workerId: "flow10-b09-worker",
      orderId,
      limit: 1,
    });

    expect(result).toEqual({ claimed: 1, sent: 1, failed: 0, skipped: 0 });
    expect(mocks.sendText).toHaveBeenCalledTimes(1);
    const outbound = mocks.sendText.mock.calls[0]?.[0];
    expect(outbound).toMatchObject({
      phoneNumberId: "technical-phone-number-id",
      recipient: "5500000000000",
    });
    expect(outbound.body).toContain("#742");
    expect(outbound.body).not.toContain(`/m/flow10-technical-store/pedido/${orderId}/acesso`);

    expect(mocks.rpc).toHaveBeenCalledWith(
      "order_notification_finish_internal",
      expect.objectContaining({
        p_notification_id: notificationJobId,
        p_status: "sent",
        p_message_id: "technical-outbound-message",
      }),
    );

    const trackingUrl = `https://pedeaqui.example/m/flow10-technical-store/pedido/${orderId}/acesso?t=${trackingToken}`;
    const tracking = projectOrderTrackingState({
      fulfillmentType: "delivery",
      orderStatus: "confirmed",
      productionStatus: "ready",
      fulfillmentStatus: "out_for_delivery",
    });
    const botReply = buildOrderLookupMessage({
      displayNumber: 742,
      orderStatus: "confirmed",
      productionStatus: "ready",
      fulfillmentStatus: "out_for_delivery",
      trackingUrl,
      visibleStage: "delivering",
    });

    expect(tracking.stage).toBe("out_for_delivery");
    expect(botReply).toContain("pedido #742");
    expect(botReply).toContain("Etapa atual: Saiu para entrega");
    expect(botReply).toContain(trackingUrl);
  });
});
