import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import type { ChargeRow } from "@/server/payments/order-pix-service";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ admin: vi.fn(), credentials: vi.fn(), health: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/server/payments/order-payment-provider-config-service", () => ({ OrderPaymentProviderConfigService: { credentials: mocks.credentials, recordHealth: mocks.health } }));
import { InfinitePayCheckoutService } from "@/server/payments/infinitepay-checkout-service";
import { processInfinitePayOrderWebhook } from "@/server/payments/infinitepay-webhook-service";

const initial = () => ({ id: "charge", store_id: "store", organization_id: "org", order_id: "order", payment_id: "payment", provider: "infinitepay", amount_cents: 3790, currency: "BRL", external_reference: "pa_payment_abc_1", status: "creating", checkout_creation_started_at: null, provider_order_id: null, provider_payment_id: null });
let row: Record<string, unknown>;
let event: Record<string, unknown> | null;
let writes: Array<Record<string, unknown>>;
let rpc: ReturnType<typeof vi.fn>;
let fetcher: ReturnType<typeof vi.fn<typeof fetch>>;
const notification = { order_nsu: "pa_payment_abc_1", transaction_nsu: "tx-123", invoice_slug: "invoice-456" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function query(table: string) {
  const filters: Array<(r: Record<string, unknown>) => boolean> = [];
  let patch: Record<string, unknown> | null = null;
  let insert: Record<string, unknown> | null = null;
  const execute = () => {
    if (table === "stores") return { data: { slug: "dona-maria" }, error: null };
    if (table === "order_payment_provider_events") {
      if (insert) {
        if (event) return { data: null, error: { code: "23505" } };
        event = { ...insert, id: "event" };
      }
      if (patch && event) Object.assign(event, patch);
      return { data: event && { ...event }, error: null };
    }
    if (!filters.every((filter) => filter(row))) return { data: null, error: null };
    if (patch) { writes.push(patch); Object.assign(row, patch); }
    return { data: { ...row }, error: null };
  };
  const builder = {
    select: (_columns?: string) => builder,
    eq: (key: string, value: unknown) => { filters.push((r) => r[key] === value); return builder; },
    neq: (key: string, value: unknown) => { filters.push((r) => r[key] !== value); return builder; },
    is: (key: string, value: unknown) => { filters.push((r) => (r[key] ?? null) === value); return builder; },
    update: (value: Record<string, unknown>) => { patch = value; return builder; },
    insert: (value: Record<string, unknown>) => { insert = value; return builder; },
    single: async () => execute(), maybeSingle: async () => execute(),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(execute()).then(resolve),
  };
  return builder;
}

beforeEach(() => {
  row = initial(); event = null; writes = [];
  rpc = vi.fn().mockResolvedValue({ error: null });
  mocks.admin.mockReturnValue({ from: query, rpc });
  mocks.credentials.mockResolvedValue({ store_id: "store", organization_id: "org", provider_account_id: "dona-maria", access_token: "inchk_store_secret", webhook_secret: "callback-secret", environment: "production", enabled: true, revoked_at: null });
  mocks.health.mockResolvedValue(undefined);
  fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ url: "https://checkout.infinitepay.com.br/link" }));
  vi.stubGlobal("fetch", fetcher);
  vi.stubEnv("APP_URL", "https://www.pedeaqui.pp.ua");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetAllMocks(); });

const create = () => InfinitePayCheckoutService.create(row as unknown as ChargeRow, { email: "customer@example.com", name: "Maria" });

describe("InfinitePay payment lifecycle", () => {
  it("creates one link across 20 simultaneous requests, using a database claim", async () => {
    await Promise.all(Array.from({ length: 20 }, () => create()));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(row).toMatchObject({ status: "pending", ticket_url: "https://checkout.infinitepay.com.br/link" });
    const body = JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body));
    expect(body.webhook.url).toContain("/infinitepay/store?token=callback-secret");
    expect(body.redirect_url).toBe("https://www.pedeaqui.pp.ua/m/dona-maria/pedido/order/infinitepay/retorno");
  });

  it("never recreates a link after an ambiguous timeout", async () => {
    fetcher.mockRejectedValue(new Error("request timed out after provider may have created the link"));
    await expect(create()).rejects.toThrow("timed out");
    await create();
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(row).toMatchObject({ status: "creating", last_error_code: "checkout_creation_uncertain" });
  });

  it("permits retry after a definitive authentication rejection", async () => {
    fetcher.mockResolvedValueOnce(json({}, 401));
    await expect(create()).rejects.toThrow("401");
    expect(row.checkout_creation_started_at).toBeNull();
    await create();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each(["pix", "credit_card"])("settles %s using only the remotely confirmed amount and method", async (capture_method) => {
    fetcher.mockResolvedValue(json({ success: true, paid: true, amount: 3790, paid_amount: 4000, capture_method }));
    expect(await InfinitePayCheckoutService.reconcile("store", notification, "order")).toEqual({ paid: true });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("order_payment_provider_infinitepay_confirm_internal", { p_charge_id: "charge", p_store_id: "store", p_amount_cents: 3790, p_method: capture_method, p_transaction_nsu: "tx-123", p_invoice_slug: "invoice-456" });
  });

  it("rejects provider-confirmed amounts that do not match the canonical payment", async () => {
    fetcher.mockResolvedValue(json({ success: true, paid: true, amount: 1, capture_method: "pix" }));
    await expect(InfinitePayCheckoutService.reconcile("store", notification)).rejects.toThrow("amount mismatch");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("never confirms a pending remote transaction", async () => {
    fetcher.mockResolvedValue(json({ success: true, paid: false, amount: 3790, capture_method: "pix" }));
    expect(await InfinitePayCheckoutService.reconcile("store", notification)).toEqual({ paid: false });
    expect(rpc).not.toHaveBeenCalled();
    expect(row.status).toBe("creating");
  });

  it.each(["other-store", "store"])("rejects another store/reference before making an API call (%s)", async (storeId) => {
    await expect(InfinitePayCheckoutService.reconcile(storeId, { ...notification, order_nsu: "other-payment" })).rejects.toThrow("not found");
    expect(fetcher).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
  });

  it("binds browser returns to the order authorized by its cookie", async () => {
    await expect(InfinitePayCheckoutService.reconcile("store", notification, "other-order")).rejects.toThrow("not found");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("continues settling previously issued links after disabling or disconnecting the provider", async () => {
    mocks.credentials.mockResolvedValue({ provider_account_id: "dona-maria", access_token: "key", environment: "production", enabled: false, revoked_at: "2026-10-20T00:00:00Z" });
    fetcher.mockResolvedValue(json({ success: true, paid: true, amount: 3790, capture_method: "pix" }));
    await expect(create()).rejects.toThrow("not connected");
    expect(await InfinitePayCheckoutService.reconcile("store", notification)).toEqual({ paid: true });
  });

  it("rejects webhook requests without the private callback token", async () => {
    await expect(processInfinitePayOrderWebhook({ storeId: "store", rawBody: JSON.stringify(notification), token: "wrong" })).rejects.toThrow("token is invalid");
    expect(fetcher).not.toHaveBeenCalled(); expect(rpc).not.toHaveBeenCalled();
  });

  it("confirms repeated provider webhooks once and retains only the payload hash", async () => {
    fetcher.mockResolvedValue(json({ success: true, paid: true, amount: 3790, capture_method: "credit_card" }));
    const input = { storeId: "store", token: "callback-secret", rawBody: JSON.stringify({ ...notification, customer: { email: "private@example.com" } }) };
    expect(await processInfinitePayOrderWebhook(input)).toMatchObject({ reconciled: true });
    expect(await processInfinitePayOrderWebhook(input)).toMatchObject({ duplicate: true });
    expect(fetcher).toHaveBeenCalledTimes(1); expect(rpc).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(event)).not.toContain("private@example.com");
    expect(event?.payload_sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("retries a failed webhook when the provider is available again", async () => {
    fetcher.mockResolvedValueOnce(json({}, 503)).mockResolvedValue(json({ success: true, paid: true, amount: 3790, capture_method: "pix" }));
    const input = { storeId: "store", token: "callback-secret", rawBody: JSON.stringify(notification) };
    await expect(processInfinitePayOrderWebhook(input)).rejects.toThrow("503");
    expect(event?.status).toBe("error");
    expect(await processInfinitePayOrderWebhook(input)).toMatchObject({ reconciled: true });
    expect(event?.status).toBe("processed");
  });
});
