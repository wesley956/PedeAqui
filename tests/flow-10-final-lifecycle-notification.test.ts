import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ids = {
  organization: "78000000-0000-4000-8000-000000000001",
  store: "78000000-0000-4000-8000-000000000002",
  order: "78000000-0000-4000-8000-000000000003",
};

type NotificationType = "order_received" | "order_confirmed" | "production_preparing" | "delivered";

const state = vi.hoisted(() => ({
  notificationType: "order_received" as NotificationType,
  orderStatus: "pending_confirmation",
  productionStatus: "pending_confirmation",
  fulfillmentStatus: "pending",
  jobId: "78000000-0000-4000-8000-000000000010",
  eventId: "78000000-0000-4000-8000-000000000020",
}));

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), sendText: vi.fn(), loadCapability: vi.fn(), resolveRecipient: vi.fn(), recordGrowth: vi.fn() }));

function row(data: unknown) {
  const query: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "limit"]) query[method] = () => query;
  query.maybeSingle = async () => ({ data, error: null });
  return query;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: mocks.rpc,
    from: (table: string) => {
      const rows: Record<string, unknown> = {
        orders: {
          id: ids.order, organization_id: ids.organization, store_id: ids.store, display_number: 944,
          fulfillment_type: "delivery", order_status: state.orderStatus, customer_id: null,
          customer_name_snapshot: "Cliente Técnico Final", customer_phone_snapshot: "5511999990044",
        },
        store_conversation_settings: {
          whatsapp_enabled: true, connection_status: "connected", whatsapp_phone_number_id: "technical-phone-id",
          access_token_secret_ref: "technical-secret", app_secret_secret_ref: "technical-app-secret",
          order_notifications_enabled: true, notify_order_received: true, notify_order_confirmed: true,
          notify_production_preparing: true, notify_payment_paid: true, notify_pickup_ready: true,
          notify_pickup_completed: true, notify_out_for_delivery: true, notify_delivered: true,
          notify_order_canceled: true, order_notification_custom_templates: null,
          order_notification_template_name: null, order_notification_template_language: "pt_BR",
        },
        stores: { name: "Loja Técnica Final", slug: "flow10-final-store", status: "active" },
        order_notification_contexts: { tracking_access_token: "flow10-final-tracking-token" },
        messages: { created_at: new Date().toISOString() },
      };
      return row(rows[table] ?? null);
    },
  }),
}));

vi.mock("@/server/conversations/whatsapp-automation-capability", () => ({
  resolveWhatsAppAutomationCapabilities: () => ({
    order_received: { state: "enabled" }, order_confirmed: { state: "enabled" },
    production_preparing: { state: "enabled" }, delivered: { state: "enabled" },
  }),
  automationCanDispatch: (capability: { state: string }) => capability.state === "enabled",
}));

vi.mock("@/server/conversations/whatsapp-automation-capability-service", () => ({
  WhatsAppAutomationCapabilityService: { loadForStore: mocks.loadCapability },
}));

vi.mock("@/server/conversations/order-recipient-resolver", () => ({ resolveOrderRecipient: mocks.resolveRecipient }));

vi.mock("@/server/conversations/provider", () => ({
  WhatsAppProviderError: class WhatsAppProviderError extends Error {},
  resolveWhatsAppAccessToken: () => "technical-access-token",
  WhatsAppCloudProvider: class { sendText = mocks.sendText; },
}));

vi.mock("@/server/observability/failure", () => ({ recordFailure: vi.fn() }));
vi.mock("@/server/growth/growth-observability", () => ({ recordGrowthOperationalEvent: mocks.recordGrowth }));

import { buildOrderLookupMessage, resolveWhatsAppBotIntent } from "@/server/conversations/bot-menu";
import { runOrderWhatsAppNotificationWorker } from "@/server/conversations/order-notification-worker";
import { projectOrderTrackingState } from "@/server/conversations/order-tracking-projection";

describe("FLOW-10 A07-A11 notification and public lifecycle", () => {
  const previousAppUrl = process.env.APP_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.APP_URL = "https://pedeaqui.example";
    mocks.loadCapability.mockResolvedValue({ businessType: "restaurant", modules: {}, onlinePaymentReady: true, deliveryOperationEnabled: true, workflowEligibility: {}, workflowSettings: {} });
    mocks.resolveRecipient.mockResolvedValue({ ok: true, phoneNormalized: "5511999990044", source: "order_snapshot" });
    mocks.sendText.mockResolvedValue({ externalMessageId: `provider-${state.notificationType}` });
    mocks.recordGrowth.mockResolvedValue(undefined);
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "order_notification_claim_for_order_internal") return { data: [{ id: state.jobId, organization_id: ids.organization, store_id: ids.store, order_id: ids.order, domain_event_id: state.eventId, notification_type: state.notificationType, attempts: 1 }], error: null };
      if (name === "conversation_resolve_outbound_internal") return { data: { conversation_id: "technical-conversation", external_id: "5511999990044" }, error: null };
      if (name === "order_notification_claim_workflow_checkpoint_internal") return { data: true, error: null };
      if (name === "conversation_create_outbound_internal") return { data: { id: `message-${state.notificationType}`, delivery_status: "pending" }, error: null };
      return { data: null, error: null };
    });
  });

  afterEach(() => {
    if (previousAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = previousAppUrl;
  });

  async function proveStage(input: {
    type: NotificationType; orderStatus: string; productionStatus: string; fulfillmentStatus: string;
    jobSuffix: string; eventSuffix: string; expectedStage: string; expectedText: string; expectsTrackingLink?: boolean;
  }) {
    Object.assign(state, {
      notificationType: input.type, orderStatus: input.orderStatus, productionStatus: input.productionStatus,
      fulfillmentStatus: input.fulfillmentStatus,
      jobId: `78000000-0000-4000-8000-0000000000${input.jobSuffix}`,
      eventId: `78000000-0000-4000-8000-0000000000${input.eventSuffix}`,
    });
    mocks.sendText.mockResolvedValueOnce({ externalMessageId: `provider-${input.type}` });

    const result = await runOrderWhatsAppNotificationWorker({ workerId: `flow10-${input.type}`, orderId: ids.order, limit: 1 });
    const tracking = projectOrderTrackingState({
      fulfillmentType: "delivery", orderStatus: input.orderStatus,
      productionStatus: input.productionStatus, fulfillmentStatus: input.fulfillmentStatus,
    });

    expect(result).toEqual({ claimed: 1, sent: 1, failed: 0, skipped: 0 });
    expect(tracking).toMatchObject({ stage: input.expectedStage, statusText: input.expectedText });
    expect(mocks.sendText).toHaveBeenLastCalledWith(expect.objectContaining({ recipient: "5511999990044" }));
    const outbound = mocks.sendText.mock.calls.at(-1)?.[0];
    expect(outbound.body).toContain("pedido #944");
    if (input.expectsTrackingLink !== false) {
      expect(outbound.body).toContain(`/m/flow10-final-store/pedido/${ids.order}/acesso`);
    }
    expect(mocks.rpc).toHaveBeenCalledWith("order_notification_finish_internal", expect.objectContaining({
      p_notification_id: state.jobId, p_status: "sent", p_message_id: `message-${input.type}`,
    }));
    return tracking;
  }

  it("A07 sends recebido and exposes the same received tracking stage", async () => {
    await proveStage({ type: "order_received", orderStatus: "pending_confirmation", productionStatus: "pending_confirmation", fulfillmentStatus: "pending", jobSuffix: "11", eventSuffix: "21", expectedStage: "received", expectedText: "Pedido recebido" });
  });

  it("A08 sends confirmado and exposes the same confirmed tracking stage", async () => {
    await proveStage({ type: "order_confirmed", orderStatus: "confirmed", productionStatus: "pending", fulfillmentStatus: "pending", jobSuffix: "12", eventSuffix: "22", expectedStage: "confirmed", expectedText: "Pedido confirmado" });
  });

  it("A09 sends em preparo and exposes the same preparing tracking stage", async () => {
    await proveStage({ type: "production_preparing", orderStatus: "confirmed", productionStatus: "preparing", fulfillmentStatus: "pending", jobSuffix: "13", eventSuffix: "23", expectedStage: "preparing", expectedText: "Pedido em preparo" });
  });

  it("A10 sends delivered and reaches terminal delivery on the same order", async () => {
    const tracking = await proveStage({ type: "delivered", orderStatus: "completed", productionStatus: "ready", fulfillmentStatus: "delivered", jobSuffix: "14", eventSuffix: "24", expectedStage: "delivered", expectedText: "Pedido entregue", expectsTrackingLink: false });
    expect(tracking.terminal).toBe(true);
  });

  it("A11 answers the tracking intent with the latest delivered public stage", async () => {
    await proveStage({ type: "delivered", orderStatus: "completed", productionStatus: "ready", fulfillmentStatus: "delivered", jobSuffix: "15", eventSuffix: "25", expectedStage: "delivered", expectedText: "Pedido entregue", expectsTrackingLink: false });
    expect(resolveWhatsAppBotIntent("onde está meu pedido?", "menu")).toBe("track_start");
    const reply = buildOrderLookupMessage({
      displayNumber: 944, orderStatus: "completed", productionStatus: "ready", fulfillmentStatus: "delivered",
      trackingUrl: `https://pedeaqui.example/m/flow10-final-store/pedido/${ids.order}/acesso`, visibleStage: "finished",
    });
    expect(reply).toContain("pedido #944");
    expect(reply).toContain("Etapa atual: Pedido entregue");
    expect(reply).toContain(ids.order);
  });
});
