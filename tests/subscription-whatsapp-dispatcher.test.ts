import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), send: vi.fn(), verify: vi.fn(), templates: vi.fn(), access: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from, rpc: mocks.rpc }) }));
vi.mock("@/server/platform/platform-admin-service", () => ({ PlatformAdminService: { access: mocks.access }, PlatformAuthorizationError: class extends Error {} }));
vi.mock("@/server/billing/subscription-whatsapp-transport", () => ({ sendOfficialBillingTemplate: mocks.send, verifyOfficialBillingNumber: mocks.verify }));
vi.mock("@/server/conversations/provider", () => ({ WhatsAppCloudProvider: class { listTemplates = mocks.templates; } }));
import { SubscriptionWhatsAppDispatcher } from "@/server/billing/subscription-whatsapp-dispatcher";
const org = "11950000-0000-4000-8000-000000000002";
const notice = { id: "11950000-0000-4000-8000-000000000005", organization_id: org, subscription_id: "11950000-0000-4000-8000-000000000004", invoice_id: null, kind: "reactivated" };
const env = { PEDEAQUI_BILLING_WHATSAPP_ENABLED: "true", PEDEAQUI_BILLING_WHATSAPP_PHONE_NUMBER_ID: "123456789", PEDEAQUI_BILLING_WHATSAPP_BUSINESS_ACCOUNT_ID: "987654321", PEDEAQUI_BILLING_WHATSAPP_ACCESS_TOKEN: "dedicated-token", PEDEAQUI_BILLING_WHATSAPP_TEMPLATES: JSON.stringify({ due_soon: "due_soon", due_today: "due_today", overdue: "overdue", suspended: "suspended", reactivated: "reactivated" }) };
beforeEach(() => {
  vi.clearAllMocks(); for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  mocks.verify.mockResolvedValue(true);
  mocks.templates.mockResolvedValue([{ name: "reactivated", language: "pt_BR", status: "APPROVED", category: "UTILITY", bodyText: "Reativado", bodyParameterCount: 0, supported: true }]);
  mocks.from.mockImplementation((table: string) => {
    const result = table === "store_conversation_settings" ? { data: [], error: null }
      : table === "subscription_billing_notifications" ? { data: [notice], error: null }
        : { data: { metadata: { billing_whatsapp_contact: { name: "Financeiro", phone: "5519999999999", enabled: true, consentConfirmed: true } }, updated_at: "2026-10-02T00:00:00Z" }, error: null };
    const query = { select: () => query, eq: vi.fn(() => query), lte: () => query, order: () => query, limit: () => query,
      maybeSingle: async () => result, then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve) };
    return query;
  });
  mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "claim_subscription_whatsapp" ? "attempt-token" : true, error: null }));
  mocks.send.mockResolvedValue({ state: "sent", externalMessageId: "wamid.test", code: null });
});
afterEach(() => vi.unstubAllEnvs());
describe("durable official billing dispatcher", () => {
  it("does no DB/provider work while disabled", async () => {
    vi.stubEnv("PEDEAQUI_BILLING_WHATSAPP_ENABLED", "false");
    expect((await SubscriptionWhatsAppDispatcher.dispatch()).disabled).toBe(true);
    expect(mocks.from).not.toHaveBeenCalled(); expect(mocks.verify).not.toHaveBeenCalled();
  });
  it("blocks a sender outside the official WABA", async () => {
    mocks.verify.mockResolvedValue(false);
    await expect(SubscriptionWhatsAppDispatcher.dispatch()).rejects.toThrow("billing_sender_not_exclusive");
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.send).not.toHaveBeenCalled();
  });
  it("only winner of atomic reservation sends", async () => {
    let claimed = false;
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name !== "claim_subscription_whatsapp") return { data: true, error: null };
      if (claimed) return { data: null, error: null };
      claimed = true; return { data: "attempt-token", error: null };
    });
    const outcomes = await Promise.all([SubscriptionWhatsAppDispatcher.dispatch(), SubscriptionWhatsAppDispatcher.dispatch()]);
    expect(mocks.send).toHaveBeenCalledTimes(1);
    expect(outcomes.reduce((sum, outcome) => sum + outcome.sent, 0)).toBe(1);
    expect(mocks.rpc).toHaveBeenCalledWith("claim_subscription_whatsapp", expect.objectContaining({ p_organization_id: org, p_subscription_updated_at: "2026-10-02T00:00:00Z" }));
  });
  it("does not repeat accepted POST when persistence fails", async () => {
    mocks.rpc.mockImplementation(async (name: string) => ({ data: name === "claim_subscription_whatsapp" ? "attempt-token" : null, error: name === "finish_subscription_whatsapp" ? { message: "DB unavailable" } : null }));
    expect((await SubscriptionWhatsAppDispatcher.dispatch()).errors).toBe(1);
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it("stores uncertainty without retry or sent status", async () => {
    mocks.send.mockResolvedValue({ state: "unknown", externalMessageId: null, code: "network_outcome_unknown" });
    const outcome = await SubscriptionWhatsAppDispatcher.dispatch();
    expect(outcome).toMatchObject({ unknown: 1, sent: 0 });
    expect(mocks.rpc).toHaveBeenCalledWith("finish_subscription_whatsapp", expect.objectContaining({ p_state: "unknown", p_external_message_id: null }));
  });
  it("denies support reprocessing before touching DB", async () => {
    mocks.access.mockResolvedValue({ role: "support" });
    await expect(SubscriptionWhatsAppDispatcher.reprocess({ notificationId: notice.id, organizationId: org, reason: "Review rejection" })).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});
