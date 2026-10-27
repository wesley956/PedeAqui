import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  linked: { organization_id: "org-jack", store_id: "jack" } as { organization_id: string; store_id: string } | null,
  lookupError: null as Error | null,
  credentials: vi.fn(), reconcile: vi.fn(), subscription: vi.fn(), insert: vi.fn(), update: vi.fn(),
  filters: [] as Array<[string, unknown]>,
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (table: string) => {
  if (table === "order_payment_provider_charges") {
    const q = { select: () => q, eq: (k: string, v: unknown) => { mocks.filters.push([k, v]); return q; }, maybeSingle: async () => ({ data: mocks.linked, error: mocks.lookupError }) };
    return q;
  }
  return {
    insert: (row: unknown) => { mocks.insert(row); return { select: () => ({ maybeSingle: async () => ({ data: { id: "event-1" }, error: null }) }) }; },
    update: (row: unknown) => { mocks.update(row); return { eq: async () => ({ error: null }) }; },
  };
} }) }));
vi.mock("@/server/payments/order-payment-provider-config-service", () => ({ OrderPaymentProviderConfigService: { credentials: mocks.credentials } }));
vi.mock("@/server/payments/order-pix-service", () => ({ OrderPixService: { reconcile: mocks.reconcile } }));
vi.mock("@/server/billing/platform-billing-source-service", () => ({ PlatformBillingSourceService: { configuration: async () => ({ sourceStoreId: "legacy-store", credentialsReady: true }) } }));
vi.mock("@/server/billing/subscription-pix-billing-service", () => ({ SubscriptionPixBillingService: { reconcileByProviderResource: mocks.subscription } }));
import { MercadoPagoWebhookAuthError, processMercadoPagoOrderWebhook } from "@/server/payments/mercado-pago-webhook-service";

const id = "ORD01JACK123";
function input(secret = "jack-secret") {
  const requestId = "provider-request";
  const ts = "1793061963";
  const digest = createHmac("sha256", secret).update(`id:${id.toLowerCase()};request-id:${requestId};ts:${ts};`).digest("hex");
  return { storeId: "legacy-store", dataId: id, headers: new Headers({ "x-signature": `ts=${ts},v1=${digest}`, "x-request-id": requestId }), rawBody: JSON.stringify({ id: "notification-1", type: "order", action: "order.processed", data: { id }, user_id: "untrusted-seller" }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.linked = { organization_id: "org-jack", store_id: "jack" };
  mocks.lookupError = null;
  mocks.filters = [];
  mocks.credentials.mockImplementation(async (storeId) => storeId === "jack"
    ? { enabled: true, webhook_secret: "jack-secret", store_id: "jack", organization_id: "org-jack" }
    : { enabled: false, webhook_secret: "legacy-secret", store_id: "legacy-store", organization_id: "org-legacy" });
  mocks.reconcile.mockResolvedValue({ status: "paid" });
  mocks.subscription.mockResolvedValue({ matched: false });
});

describe("Mercado Pago webhook routes by canonical charge", () => {
  it("reconciles Jack's charge even when the provider retains a disabled store's URL", async () => {
    const result = await processMercadoPagoOrderWebhook(input());
    expect(result.paymentStatus).toBe("paid");
    expect(mocks.credentials).toHaveBeenCalledWith("jack", "mercado_pago");
    expect(mocks.reconcile).toHaveBeenCalledWith("jack", id);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ store_id: "jack", organization_id: "org-jack", provider_order_id: id }));
    expect(mocks.filters).toEqual([["provider", "mercado_pago"], ["provider_order_id", id]]);
    expect(mocks.subscription).not.toHaveBeenCalled();
  });
  it("rejects a signature from the URL's store instead of the charge owner's store", async () => {
    await expect(processMercadoPagoOrderWebhook(input("legacy-secret"))).rejects.toBeInstanceOf(MercadoPagoWebhookAuthError);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
  it("rejects mismatched credential ownership before writes", async () => {
    mocks.credentials.mockResolvedValue({ enabled: true, webhook_secret: "jack-secret", store_id: "jack", organization_id: "other-org" });
    await expect(processMercadoPagoOrderWebhook(input())).rejects.toBeInstanceOf(MercadoPagoWebhookAuthError);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
  it("uses the existing URL flow when the signed resource is not locally linked", async () => {
    mocks.linked = null;
    mocks.credentials.mockResolvedValue({ enabled: true, webhook_secret: "legacy-secret", store_id: "legacy-store", organization_id: "org-legacy" });
    mocks.subscription.mockResolvedValue({ matched: true, status: "paid", idempotent: false });
    expect(await processMercadoPagoOrderWebhook(input("legacy-secret"))).toMatchObject({ subscriptionBilling: true, paymentStatus: "paid" });
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
  it("does not trust a different resource in the JSON body", async () => {
    const request = input();
    request.rawBody = JSON.stringify({ id: "untrusted-event", type: "order", action: "order.processed", data: { id: "OTHER-ORDER" } });
    await processMercadoPagoOrderWebhook(request);
    expect(mocks.reconcile).toHaveBeenCalledWith("jack", id);
    expect(mocks.insert).toHaveBeenCalledWith(expect.objectContaining({ provider_event_id: "request:provider-request", provider_order_id: id }));
  });
  it("fails closed when canonical charge lookup fails", async () => {
    mocks.lookupError = new Error("database unavailable");
    await expect(processMercadoPagoOrderWebhook(input())).rejects.toThrow("database unavailable");
    expect(mocks.credentials).not.toHaveBeenCalled();
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
});
