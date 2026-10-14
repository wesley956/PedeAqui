import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ credentials: vi.fn(), refresh: vi.fn(), persist: vi.fn() }));
vi.mock("@/server/payments/order-payment-provider-config-service", () => ({ OrderPaymentProviderConfigService: { credentials: mocks.credentials, persistPagBankRefresh: mocks.persist } }));
vi.mock("@/server/payments/providers/pagbank-connect", () => ({ refreshPagBankToken: mocks.refresh }));
import { getUsablePagBankCredentials } from "@/server/payments/pagbank-credential-service";
afterEach(() => vi.resetAllMocks());
it("reuses a valid one-hour token without rotating the single-use refresh token", async () => {
  const current = { enabled: true, revoked_at: null, access_token: "access", access_token_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString() };
  mocks.credentials.mockResolvedValue(current);
  expect(await getUsablePagBankCredentials("store")).toBe(current);
  expect(mocks.refresh).not.toHaveBeenCalled();
});

it("uses the winner's fresh credentials when an old single-use refresh token loses a race", async () => {
  const stale = { enabled: true, revoked_at: null, refresh_token: "old-refresh", updated_at: "old", access_token_expires_at: new Date(Date.now() - 1000).toISOString() };
  const winner = { ...stale, updated_at: "new", access_token: "winner-access", access_token_expires_at: new Date(Date.now() + 3600000).toISOString() };
  mocks.credentials.mockResolvedValueOnce(stale).mockResolvedValueOnce(winner);
  mocks.refresh.mockRejectedValueOnce(new Error("refresh token consumed"));
  expect(await getUsablePagBankCredentials("store")).toBe(winner);
  expect(mocks.persist).not.toHaveBeenCalled();
});

it("does not overwrite a newer credential after a persistence conflict", async () => {
  const stale = { enabled: true, revoked_at: null, refresh_token: "old-refresh", updated_at: "old", access_token_expires_at: new Date(Date.now() - 1000).toISOString() };
  const winner = { ...stale, updated_at: "new", access_token: "winner-access", access_token_expires_at: new Date(Date.now() + 3600000).toISOString() };
  mocks.credentials.mockResolvedValueOnce(stale).mockResolvedValueOnce(winner);
  mocks.refresh.mockResolvedValueOnce({ access_token: "loser-access", refresh_token: "loser-refresh", expires_in: 3600 });
  mocks.persist.mockRejectedValueOnce(new Error("stale version"));
  expect(await getUsablePagBankCredentials("store")).toBe(winner);
  expect(mocks.persist).toHaveBeenCalledTimes(1);
  expect(mocks.persist).toHaveBeenCalledWith(expect.objectContaining({ storeId: "store", expectedUpdatedAt: "old" }));
});

it("propagates provider failure when no newer fresh credential exists", async () => {
  const stale = { enabled: true, revoked_at: null, refresh_token: "old-refresh", updated_at: "old", access_token_expires_at: new Date(Date.now() - 1000).toISOString() };
  const outage = new Error("provider unavailable");
  mocks.credentials.mockResolvedValue(stale);
  mocks.refresh.mockRejectedValue(outage);
  await expect(getUsablePagBankCredentials("store")).rejects.toBe(outage);
  expect(mocks.persist).not.toHaveBeenCalled();
});

it("refuses a revoked connection without contacting the provider", async () => {
  mocks.credentials.mockResolvedValue({ enabled: true, revoked_at: "2026-10-14T05:00:00Z" });
  await expect(getUsablePagBankCredentials("store")).rejects.toThrow("revoked");
  expect(mocks.refresh).not.toHaveBeenCalled();
});
