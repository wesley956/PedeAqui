import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorize: vi.fn(), connect: vi.fn(), warn: vi.fn(),
}));
vi.mock("@/server/access/authorize", () => ({ authorize: mocks.authorize }));
vi.mock("@/server/payments/order-payment-provider-config-service", () => ({
  OrderPaymentProviderConfigService: { connectOAuthCurrentStore: mocks.connect },
}));
vi.mock("@/server/observability/logger", () => ({ logger: { warn: mocks.warn } }));

import { GET as start } from "@/app/api/integrations/mercado-pago/oauth/start/route";
import { GET as callback } from "@/app/api/integrations/mercado-pago/oauth/callback/route";
import { createMercadoPagoOAuthSession } from "@/server/payments/providers/mercado-pago-oauth";
import { mercadoPagoOAuthAppUrl } from "@/server/payments/mercado-pago-oauth-navigation";

const context = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  storeId: "22222222-2222-4222-8222-222222222222",
};
const callbackPath = "/api/integrations/mercado-pago/oauth/callback";
const startPath = "/api/integrations/mercado-pago/oauth/start";
const publicOrigin = "https://www.pedeaqui.pp.ua";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("APP_URL", "http://0.0.0.0:3000");
  vi.stubEnv("PUBLIC_APP_URL", "");
  vi.stubEnv("MERCADO_PAGO_CLIENT_ID", "test-client");
  vi.stubEnv("MERCADO_PAGO_CLIENT_SECRET", "test-secret");
  vi.stubEnv("MERCADO_PAGO_ORDER_WEBHOOK_SECRET", "test-webhook");
  vi.stubEnv("MERCADO_PAGO_OAUTH_REDIRECT_URI", publicOrigin + callbackPath);
  mocks.authorize.mockResolvedValue(context);
  mocks.connect.mockResolvedValue(undefined);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
    access_token: "private-access", refresh_token: "private-refresh",
    expires_in: 3600, user_id: 123, live_mode: true,
  }), { status: 200 })));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function callbackRequest(options: { state?: string; cookie?: string } = {}) {
  const created = createMercadoPagoOAuthSession(context);
  const state = options.state ?? created.session.state;
  return new Request(`https://0.0.0.0:3000${callbackPath}?code=private-code&state=${state}`, {
    headers: { cookie: `pedeaqui_mp_oauth=${options.cookie ?? created.cookieValue}` },
  });
}

function expectStatus(response: Response, status: string) {
  expect(response.headers.get("location")).toBe(`${publicOrigin}/configuracoes/pagamentos?mercado_pago=${status}`);
  expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  expect(response.headers.get("set-cookie")).toContain("Secure; HttpOnly; SameSite=lax");
}

describe("Mercado Pago OAuth behind the VPS proxy", () => {
  it("returns success to the configured public host and saves the seller credentials", async () => {
    const response = await callback(callbackRequest());
    expectStatus(response, "connected");
    expect(mocks.connect).toHaveBeenCalledWith(expect.objectContaining({
      accessToken: "private-access", refreshToken: "private-refresh", providerAccountId: "123",
    }));
  });

  it("shows a missing session on the public domain without exchanging or saving tokens", async () => {
    expectStatus(await callback(new Request(`https://0.0.0.0:3000${callbackPath}`)), "session_invalid");
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it.each([{ state: "wrong-state" }, { cookie: "%invalid" }, { cookie: "tampered.session" }])(
    "rejects invalid state/cookies and clears the session: %j", async (options) => {
      expectStatus(await callback(callbackRequest(options)), "session_invalid");
      expect(fetch).not.toHaveBeenCalled();
      expect(mocks.connect).not.toHaveBeenCalled();
    },
  );

  it("rejects an expired session", async () => {
    vi.useFakeTimers();
    try {
      const request = callbackRequest();
      vi.advanceTimersByTime(10 * 60 * 1000 + 1);
      expectStatus(await callback(request), "session_invalid");
      expect(fetch).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it("handles seller cancellation without a token exchange", async () => {
    expectStatus(await callback(new Request(`https://0.0.0.0:3000${callbackPath}?error=access_denied`)), "authorization_denied");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps permission checks before token exchange", async () => {
    mocks.authorize.mockRejectedValueOnce(new Error("private authorization detail"));
    expectStatus(await callback(callbackRequest()), "not_authorized");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects changing stores during authorization", async () => {
    mocks.authorize.mockResolvedValueOnce({ ...context, storeId: "other-store" });
    expectStatus(await callback(callbackRequest()), "context_changed");
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("distinguishes provider rejection without leaking the code, tokens or response", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }));
    expectStatus(await callback(callbackRequest()), "token_exchange_failed");
    expect(mocks.connect).not.toHaveBeenCalled();
    expect(mocks.warn).toHaveBeenCalledWith("mercado_pago_oauth_callback_failed", {
      stage: "exchange_token", errorType: "Error",
    });
    expect(JSON.stringify(mocks.warn.mock.calls)).not.toMatch(/private-|invalid_grant/);
  });

  it("distinguishes a persistence failure from provider authorization", async () => {
    mocks.connect.mockRejectedValueOnce(new Error("private database detail"));
    expectStatus(await callback(callbackRequest()), "connection_save_failed");
    expect(mocks.warn).toHaveBeenCalledWith("mercado_pago_oauth_callback_failed", {
      stage: "save_connection", errorType: "Error",
    });
  });

  it("starts on the callback host before setting host-only OAuth cookies", async () => {
    const response = await start(new Request(`https://0.0.0.0:3000${startPath}`, {
      headers: { "x-forwarded-host": "pedeaqui.pp.ua" },
    }));
    expect(response.headers.get("location")).toBe(publicOrigin + startPath);
    expect(response.headers.has("set-cookie")).toBe(false);
    expect(mocks.authorize).not.toHaveBeenCalled();
  });

  it("recognizes the forwarded callback host and preserves PKCE and secure cookies", async () => {
    const response = await start(new Request(`https://0.0.0.0:3000${startPath}`, {
      headers: { "x-forwarded-host": "www.pedeaqui.pp.ua" },
    }));
    const authorization = new URL(response.headers.get("location")!);
    expect(authorization.origin).toBe("https://auth.mercadopago.com");
    expect(authorization.searchParams.get("redirect_uri")).toBe(publicOrigin + callbackPath);
    expect(authorization.searchParams.get("code_challenge_method")).toBe("S256");
    expect(response.headers.get("set-cookie")).toContain("Secure; HttpOnly; SameSite=lax");
  });

  it("returns setup errors publicly even when listener URLs are configured", async () => {
    vi.stubEnv("MERCADO_PAGO_OAUTH_REDIRECT_URI", "");
    expect(mercadoPagoOAuthAppUrl("/configuracoes/pagamentos").origin).toBe("https://pedeaqui.pp.ua");
    vi.stubEnv("APP_URL", "https://0.0.0.0:3000");
    const response = await start(new Request(`https://0.0.0.0:3000${startPath}`));
    expect(response.headers.get("location")).toBe("https://pedeaqui.pp.ua/configuracoes/pagamentos?mercado_pago=setup_required");
  });

  it("never uses an attacker-supplied host for navigation", async () => {
    const response = await start(new Request(`https://0.0.0.0:3000${startPath}`, {
      headers: { "x-forwarded-host": "attacker.invalid", host: "attacker.invalid" },
    }));
    expect(response.headers.get("location")).toBe(publicOrigin + startPath);
  });
});
