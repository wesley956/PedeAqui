import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => ({
  canReply: vi.fn(), ingest: vi.fn(), order: vi.fn(), greeting: vi.fn(), finalize: vi.fn(), failure: vi.fn(),
}));
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/server/conversations/conversation-service", () => ({ ConversationService: { ingestWhatsAppEvent: calls.ingest } }));
vi.mock("@/server/conversations/automation-hours-service", () => ({ WhatsAppAutomationHoursService: { canReply: calls.canReply } }));
vi.mock("@/server/conversations/conversation-media-service", () => ({ ConversationMediaService: {} }));
vi.mock("@/server/conversations/coexistence-observability", () => ({ WhatsAppCoexistenceObservability: { recordWebhookReceipt: vi.fn() } }));
vi.mock("@/server/conversations/coexistence-service", () => ({ WhatsAppCoexistenceService: {} }));
vi.mock("@/server/conversations/greeting-service", () => ({ ConversationGreetingService: { afterInbound: calls.greeting } }));
vi.mock("@/server/conversations/inbound-outcome-service", () => ({ InboundOutcomeService: { finalize: calls.finalize } }));
vi.mock("@/server/conversations/whatsapp-direct-order-orchestrator", () => ({ WhatsAppDirectOrderOrchestrator: { afterInbound: calls.order } }));
vi.mock("@/server/conversations/webhook-routing", () => ({ resolveWhatsAppWebhookRouting: async () => ({ appSecret: "test", configuredPhoneNumberIds: new Set(["phone"]) }) }));
vi.mock("@/server/conversations/whatsapp-webhook", () => ({
  parseWhatsAppWebhook: () => [{ kind: "message", phoneNumberId: "phone", providerTimestamp: "2026-10-26T15:00:00Z" }],
  verifyMetaWebhookSignature: () => true,
  webhookPhoneNumberIds: () => ["phone"],
}));
vi.mock("@/server/intelligence/unified-router-shadow", () => ({ UnifiedIntelligenceRouterShadow: { afterInbound: async () => null } }));
vi.mock("@/server/intelligence/shadow-observability", () => ({ IntelligenceShadowObservability: {} }));
vi.mock("@/server/observability/failure", () => ({ recordFailure: calls.failure }));
vi.mock("@/server/observability/request-context", () => ({ getRequestContext: async () => ({ requestId: "request-a" }) }));
import { POST } from "@/app/api/webhooks/whatsapp/route";

beforeEach(() => {
  vi.clearAllMocks();
  calls.ingest.mockResolvedValue({ conversation_id: "conversation-a", message_id: "message-a", message_created: true });
  calls.canReply.mockResolvedValue(false);
  calls.order.mockResolvedValue(false);
  calls.finalize.mockResolvedValue("outbound_recorded");
});
const request = () => new Request("http://localhost/api/webhooks/whatsapp", { method: "POST", body: "{}" });

describe("webhook stays silent outside restaurant hours", () => {
  it("persists and acknowledges the inbound without a greeting, order reply or human escalation", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(calls.ingest).toHaveBeenCalledOnce();
    expect(calls.canReply).toHaveBeenCalledWith(expect.objectContaining({ conversation_id: "conversation-a" }), "2026-10-26T15:00:00Z");
    expect(calls.order).not.toHaveBeenCalled();
    expect(calls.greeting).not.toHaveBeenCalled();
    expect(calls.finalize).not.toHaveBeenCalled();
  });
  it("runs the normal bot flow when the policy permits a reply", async () => {
    calls.canReply.mockResolvedValue(true);
    expect((await POST(request())).status).toBe(200);
    expect(calls.order).toHaveBeenCalledOnce();
    expect(calls.greeting).toHaveBeenCalledOnce();
    expect(calls.finalize).toHaveBeenCalledOnce();
  });
  it("keeps silent and acknowledges the saved inbound when hours lookup fails", async () => {
    calls.canReply.mockRejectedValue(new Error("hours unavailable"));
    expect((await POST(request())).status).toBe(200);
    expect(calls.failure).toHaveBeenCalledWith("whatsapp.automation_hours.failed", expect.any(Error), expect.any(Object));
    expect(calls.order).not.toHaveBeenCalled();
    expect(calls.greeting).not.toHaveBeenCalled();
    expect(calls.finalize).not.toHaveBeenCalled();
  });
});
