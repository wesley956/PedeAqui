import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ admin: vi.fn(), reconcile: vi.fn(), health: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/server/payments/order-pix-service", () => ({ OrderPixService: { reconcile: mocks.reconcile } }));
vi.mock("@/server/payments/order-payment-provider-config-service", () => ({ OrderPaymentProviderConfigService: { recordHealth: mocks.health } }));
import { OrderPixReconciliationService } from "@/server/payments/order-pix-reconciliation-service";
import { mapPagBankOrder } from "@/server/payments/providers/pagbank-order-provider";

function query(result: unknown) {
  const builder = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), in: vi.fn(), not: vi.fn(), or: vi.fn(), order: vi.fn(), limit: vi.fn(), update: vi.fn(), then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve) };
  for (const key of ["select", "eq", "is", "in", "not", "or", "order", "limit", "update"] as const) builder[key].mockReturnValue(builder);
  return builder;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-14T05:08:00Z"));
  mocks.reconcile.mockResolvedValue({ status: "paid" });
  mocks.health.mockResolvedValue(undefined);
});
afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); });

describe("PagBank scheduled fallback", () => {
  it("reconciles a stale pending charge without a tracking page or webhook", async () => {
    const configs = query({ data: [{ store_id: "test-store" }], error: null });
    const pending = query({ data: [{ id: "charge", store_id: "test-store", provider_order_id: "ORDE_TEST" }], error: null });
    mocks.admin.mockReturnValue({ from: vi.fn().mockReturnValueOnce(configs).mockReturnValueOnce(pending) });
    expect(await OrderPixReconciliationService.runPagBankBatch()).toEqual({ scanned: 1, reconciled: 1, failed: 0 });
    expect(mocks.reconcile).toHaveBeenCalledExactlyOnceWith("test-store", "ORDE_TEST", "pagbank");
    expect(configs.eq).toHaveBeenCalledWith("enabled", true);
    expect(configs.is).toHaveBeenCalledWith("revoked_at", null);
    expect(pending.eq).toHaveBeenCalledWith("status", "pending");
    expect(pending.or).toHaveBeenCalledWith("last_reconciled_at.is.null,last_reconciled_at.lt.2026-10-14T05:06:00.000Z");
  });

  it("continues the batch after provider outage and records retry health", async () => {
    const configs = query({ data: [{ store_id: "test-store" }], error: null });
    const pending = query({ data: [
      { id: "failed-charge", store_id: "test-store", provider_order_id: "ORDE_FAIL" },
      { id: "next-charge", store_id: "test-store", provider_order_id: "ORDE_OK" },
    ], error: null });
    const failedUpdate = query({ data: null, error: null });
    mocks.admin.mockReturnValue({ from: vi.fn().mockReturnValueOnce(configs).mockReturnValueOnce(pending).mockReturnValueOnce(failedUpdate) });
    mocks.reconcile.mockRejectedValueOnce(new Error("provider temporarily unavailable"));
    expect(await OrderPixReconciliationService.runPagBankBatch()).toEqual({ scanned: 2, reconciled: 1, failed: 1 });
    expect(mocks.reconcile).toHaveBeenNthCalledWith(2, "test-store", "ORDE_OK", "pagbank");
    expect(failedUpdate.update).toHaveBeenCalledWith(expect.objectContaining({ last_error_code: "reconciliation_failed", last_reconciled_at: "2026-10-14T05:08:00.000Z" }));
    expect(failedUpdate.eq).toHaveBeenCalledWith("id", "failed-charge");
    expect(mocks.health).toHaveBeenCalledWith("test-store", { status: "error", errorCode: "reconciliation_failed" }, "pagbank");
  });

  it("makes no provider call when there is no active configuration", async () => {
    mocks.admin.mockReturnValue({ from: vi.fn().mockReturnValue(query({ data: [], error: null })) });
    expect(await OrderPixReconciliationService.runPagBankBatch()).toEqual({ scanned: 0, reconciled: 0, failed: 0 });
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });

  it("does not report success when selecting pending charges fails", async () => {
    const databaseError = new Error("database unavailable");
    mocks.admin.mockReturnValue({ from: vi.fn()
      .mockReturnValueOnce(query({ data: [{ store_id: "test-store" }], error: null }))
      .mockReturnValueOnce(query({ data: null, error: databaseError })) });
    await expect(OrderPixReconciliationService.runPagBankBatch()).rejects.toBe(databaseError);
    expect(mocks.reconcile).not.toHaveBeenCalled();
  });
});

describe("PagBank QR expiration boundary", () => {
  const order = { id: "ORDE_TEST", reference_id: "test-payment", qr_codes: [{ amount: { value: 1990 }, expiration_date: "2026-10-14T05:08:00Z", text: "test-pix" }] };
  it("is pending one millisecond before expiration and expired at the deadline", () => {
    expect(mapPagBankOrder(order, new Date("2026-10-14T05:07:59.999Z")).status).toBe("pending");
    expect(mapPagBankOrder(order, new Date("2026-10-14T05:08:00Z")).status).toBe("expired");
  });
  it("preserves a confirmed payment after QR expiry", () => {
    expect(mapPagBankOrder({ ...order, charges: [{ id: "CHAR_TEST", status: "PAID", amount: { value: 1990, currency: "BRL" } }] }, new Date("2026-10-15T05:08:00Z"))).toMatchObject({ status: "paid", providerPaymentId: "CHAR_TEST", amountCents: 1990 });
  });
});
