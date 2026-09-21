import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const ids = {
  organization: "77000000-0000-4000-8000-000000000001",
  store: "77000000-0000-4000-8000-000000000002",
  order: "77000000-0000-4000-8000-000000000003",
  event: "77000000-0000-4000-8000-000000000004",
  job: "77000000-0000-4000-8000-000000000005",
};

const state = vi.hoisted(() => ({ outsideWindow: false }));
const mocks = vi.hoisted(() => ({ rpc: vi.fn(), sendText: vi.fn(), sendTemplate: vi.fn(), loadCapability: vi.fn(), recordGrowth: vi.fn() }));

function query(data: unknown) {
  const value = { data, error: null };
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "order", "limit"]) builder[method] = () => builder;
  builder.maybeSingle = async () => value;
  return builder;
}

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: mocks.rpc,
    from: (table: string) => {
      const rows: Record<string, unknown> = {
        orders: {
          id: ids.order, organization_id: ids.organization, store_id: ids.store, display_number: 908,
          fulfillment_type: "delivery", order_status: "confirmed", customer_id: "77000000-0000-4000-8000-000000000006",
          customer_name_snapshot: "Cliente Técnico", customer_phone_snapshot: "(11) 98888-0000",
        },
        store_conversation_settings: {
          whatsapp_enabled: true, connection_status: "connected", whatsapp_phone_number_id: "technical-phone-number-id",
          access_token_secret_ref: "technical-secret-ref", app_secret_secret_ref: "technical-app-secret-ref",
          order_notifications_enabled: true, notify_order_received: true, notify_order_confirmed: true,
          notify_production_preparing: true, notify_payment_paid: true, notify_pickup_ready: true,
          notify_pickup_completed: true, notify_out_for_delivery: true, notify_delivered: true,
          notify_order_canceled: true, order_notification_custom_templates: null,
          order_notification_template_name: null, order_notification_template_language: "pt_BR",
        },
        stores: { name: "Loja Técnica FLOW-10", slug: "flow10-public-store", status: "active" },
        order_notification_contexts: { tracking_access_token: "flow10-technical-tracking-token" },
        messages: { created_at: state.outsideWindow ? "2026-09-19T00:00:00.000Z" : new Date().toISOString() },
        customers: null,
      };
      return query(rows[table] ?? null);
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

vi.mock("@/server/conversations/order-workflow-visibility", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/server/conversations/order-workflow-visibility")>();
  return { ...actual, resolveNotificationWorkflowVisibility: () => ({ eligible: true, checkpoint: "out_for_delivery" }) };
});

vi.mock("@/server/conversations/provider", () => ({
  WhatsAppProviderError: class WhatsAppProviderError extends Error {},
  resolveWhatsAppAccessToken: () => "technical-access-token",
  WhatsAppCloudProvider: class { sendText = mocks.sendText; sendTemplate = mocks.sendTemplate; },
}));

vi.mock("@/server/observability/failure", () => ({ recordFailure: vi.fn() }));
vi.mock("@/server/growth/growth-observability", () => ({ recordGrowthOperationalEvent: mocks.recordGrowth }));

import { runOrderWhatsAppNotificationWorker } from "@/server/conversations/order-notification-worker";

describe("FLOW-10 D08/D10 notification safety", () => {
  const previousAppUrl = process.env.APP_URL;

  beforeEach(() => {
    vi.clearAllMocks();
    state.outsideWindow = false;
    process.env.APP_URL = "https://pedeaqui.example";
    mocks.loadCapability.mockResolvedValue({ businessType: "restaurant", modules: {}, onlinePaymentReady: true, deliveryOperationEnabled: true, workflowEligibility: {}, workflowSettings: {} });
    mocks.sendText.mockResolvedValue({ externalMessageId: "technical-provider-message" });
    mocks.recordGrowth.mockResolvedValue(undefined);
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "order_notification_claim_for_order_internal") return { data: [{ id: ids.job, organization_id: ids.organization, store_id: ids.store, order_id: ids.order, domain_event_id: ids.event, notification_type: "out_for_delivery", attempts: 1 }], error: null };
      if (name === "conversation_resolve_outbound_internal") return { data: { conversation_id: "technical-conversation", external_id: "5511988880000" }, error: null };
      if (name === "order_notification_claim_workflow_checkpoint_internal") return { data: true, error: null };
      if (name === "conversation_create_outbound_internal") return { data: { id: "technical-outbound-message", delivery_status: "pending" }, error: null };
      return { data: null, error: null };
    });
  });

  afterEach(() => {
    if (previousAppUrl === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = previousAppUrl;
  });

  it("D08 skips safely with a diagnosable template_required result outside Meta's session window", async () => {
    state.outsideWindow = true;
    const result = await runOrderWhatsAppNotificationWorker({ workerId: "flow10-d08-worker", orderId: ids.order, limit: 1 });

    expect(result).toEqual({ claimed: 1, sent: 0, failed: 0, skipped: 1 });
    expect(mocks.sendText).not.toHaveBeenCalled();
    expect(mocks.sendTemplate).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("order_notification_finish_internal", expect.objectContaining({
      p_notification_id: ids.job,
      p_status: "skipped",
      p_error_code: "template_required",
    }));
  });

  it("D10 uses the immutable order snapshot when the linked customer record is missing", async () => {
    const result = await runOrderWhatsAppNotificationWorker({ workerId: "flow10-d10-worker", orderId: ids.order, limit: 1 });

    expect(result).toEqual({ claimed: 1, sent: 1, failed: 0, skipped: 0 });
    expect(mocks.rpc).toHaveBeenCalledWith("conversation_resolve_outbound_internal", expect.objectContaining({
      p_phone_normalized: "5511988880000",
      p_customer_id: "77000000-0000-4000-8000-000000000006",
    }));
    expect(mocks.sendText).toHaveBeenCalledWith(expect.objectContaining({ recipient: "5511988880000" }));
  });
});
