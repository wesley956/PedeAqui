import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ credentials: vi.fn(), refresh: vi.fn() }));
vi.mock("@/server/payments/order-payment-provider-config-service", () => ({ OrderPaymentProviderConfigService: { credentials: mocks.credentials } }));
vi.mock("@/server/payments/providers/pagbank-connect", () => ({ refreshPagBankToken: mocks.refresh }));
import { getUsablePagBankCredentials } from "@/server/payments/pagbank-credential-service";
afterEach(() => vi.clearAllMocks());
it("reuses a valid one-hour token without rotating the single-use refresh token", async () => {
  const current = { enabled: true, revoked_at: null, access_token: "access", access_token_expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString() };
  mocks.credentials.mockResolvedValue(current);
  expect(await getUsablePagBankCredentials("store")).toBe(current);
  expect(mocks.refresh).not.toHaveBeenCalled();
});
