import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  buildMercadoPagoAuthorizationUrl,
  createMercadoPagoOAuthSession,
  exchangeMercadoPagoAuthorizationCode,
  isMercadoPagoOAuthConfigured,
  readMercadoPagoOAuthSession,
  refreshMercadoPagoOAuthToken,
} from "@/server/payments/providers/mercado-pago-oauth";
import { MercadoPagoOrderProvider } from "@/server/payments/providers/mercado-pago-order-provider";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

function configureOAuth() {
  vi.stubEnv("MERCADO_PAGO_CLIENT_ID", "client-test");
  vi.stubEnv("MERCADO_PAGO_CLIENT_SECRET", "secret-test");
  vi.stubEnv("MERCADO_PAGO_OAUTH_REDIRECT_URI", "https://example.invalid/api/integrations/mercado-pago/oauth/callback");
  vi.stubEnv("MERCADO_PAGO_ORDER_WEBHOOK_SECRET", "webhook-test");
}

function providerResponse(input?: {
  status?: string;
  detail?: string;
  amount?: string;
  reference?: string;
}) {
  const status = input?.status ?? "action_required";
  const detail = input?.detail ?? "waiting_transfer";
  const amount = input?.amount ?? "37.90";
  const reference = input?.reference ?? "pa_payment_12345678123412341234123456789012";
  return {
    id: "ORD01JHOMOLOG853",
    external_reference: reference,
    total_amount: amount,
    country_code: "BRA",
    status,
    status_detail: detail,
    transactions: {
      payments: [{
        id: "PAY01JHOMOLOG853",
        amount,
        status,
        status_detail: detail,
        date_of_expiration: "2026-09-03T23:59:00.000Z",
        payment_method: {
          id: "pix",
          type: "bank_transfer",
          qr_code: "000201010212HOMOLOG853",
          qr_code_base64: "aG9tb2xvZw==",
          ticket_url: "https://example.invalid/pix",
        },
      }],
    },
  };
}

function requireFetchCall(fetchMock: ReturnType<typeof vi.fn>, index: number): [string, RequestInit] {
  const call = fetchMock.mock.calls.at(index);
  if (!call) throw new Error(`Expected fetch call ${index}`);
  return call as [string, RequestInit];
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("#853 Mercado Pago automated homologation gate", () => {
  it("keeps provider absent/OFF/disabled from affecting cash and card methods", () => {
    const methods = read("src/server/payments/store-payment-method-service.ts");
    const config = read("src/server/payments/order-payment-provider-config-service.ts");

    expect(methods).toContain('{ method: "credit_card", enabled: true');
    expect(methods).toContain('{ method: "debit_card", enabled: true');
    expect(methods).toContain('{ method: "cash", enabled: true');
    expect(methods).toContain('item.method === "pix"');
    expect(methods).toContain("item.enabled && onlinePixReady");
    expect(methods).toContain(": item);");
    expect(config).toContain("config?.enabled && config.credentialsConfigured && !config.revokedAt");
  });

  it("requires all OAuth server-side configuration before reporting configured", () => {
    expect(isMercadoPagoOAuthConfigured()).toBe(false);
    configureOAuth();
    expect(isMercadoPagoOAuthConfigured()).toBe(true);
    vi.stubEnv("MERCADO_PAGO_CLIENT_SECRET", "");
    expect(isMercadoPagoOAuthConfigured()).toBe(false);
  });

  it("creates a signed OAuth state with PKCE S256 and rejects tampering or expiry", () => {
    configureOAuth();
    const now = 1_788_465_600_000;
    vi.spyOn(Date, "now").mockReturnValue(now);

    const created = createMercadoPagoOAuthSession({
      organizationId: "11111111-1111-4111-8111-111111111111",
      storeId: "22222222-2222-4222-8222-222222222222",
    });
    const expectedChallenge = createHash("sha256").update(created.session.verifier).digest("base64url");
    expect(created.challenge).toBe(expectedChallenge);
    expect(readMercadoPagoOAuthSession(created.cookieValue)).toMatchObject({
      state: created.session.state,
      storeId: created.session.storeId,
      organizationId: created.session.organizationId,
    });

    const authorizationUrl = buildMercadoPagoAuthorizationUrl({
      state: created.session.state,
      challenge: created.challenge,
    });
    expect(authorizationUrl.searchParams.get("state")).toBe(created.session.state);
    expect(authorizationUrl.searchParams.get("code_challenge")).toBe(created.challenge);
    expect(authorizationUrl.searchParams.get("code_challenge_method")).toBe("S256");

    const [encoded, signature] = created.cookieValue.split(".");
    if (!encoded || !signature) throw new Error("Expected signed OAuth session");
    expect(() => readMercadoPagoOAuthSession(`${encoded}.${"A".repeat(signature.length)}`)).toThrow(/signature/i);

    vi.spyOn(Date, "now").mockReturnValue(now + 10 * 60 * 1000 + 1);
    expect(() => readMercadoPagoOAuthSession(created.cookieValue)).toThrow(/expired/i);
  });

  it("clears OAuth state after every callback, including mismatch/error, preventing browser replay", () => {
    const callback = read("src/app/api/integrations/mercado-pago/oauth/callback/route.ts");
    expect(callback).toContain("oauthSession.state !== state");
    expect(callback).toContain("Mercado Pago OAuth state mismatch");
    expect(callback).toContain("return redirectWithClearedCookie(request, status)");
    expect(callback).toContain('response.cookies.set(OAUTH_COOKIE, "",');
    expect(callback).toContain("maxAge: 0");
  });

  it("exchanges authorization code with PKCE and rotates refresh tokens server-side", async () => {
    configureOAuth();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "access-1",
        expires_in: 3600,
        user_id: "seller-1",
        refresh_token: "refresh-1",
        live_mode: false,
      }), { status: 200, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: "access-2",
        expires_in: 3600,
        user_id: "seller-1",
        refresh_token: "refresh-2",
        live_mode: false,
      }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const exchanged = await exchangeMercadoPagoAuthorizationCode({ code: "code-1", verifier: "verifier-1234567890123456789012345678901234567890123" });
    const refreshed = await refreshMercadoPagoOAuthToken(exchanged.refresh_token);
    expect(exchanged.refresh_token).toBe("refresh-1");
    expect(refreshed.refresh_token).toBe("refresh-2");

    const [, firstInit] = requireFetchCall(fetchMock, 0);
    const firstBody = JSON.parse(String(firstInit.body));
    expect(firstBody).toMatchObject({ grant_type: "authorization_code", code: "code-1" });
    expect(firstBody.code_verifier).toContain("verifier-");
    const [, secondInit] = requireFetchCall(fetchMock, 1);
    const secondBody = JSON.parse(String(secondInit.body));
    expect(secondBody).toMatchObject({ grant_type: "refresh_token", refresh_token: "refresh-1" });
  });

  it("creates Pix with the same explicit idempotency key and bounds provider requests by timeout", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(providerResponse()), {
      status: 201,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new MercadoPagoOrderProvider("APP_USR_offline-test");
    await provider.createPixCharge({
      amountCents: 3790,
      currency: "BRL",
      externalReference: "pa_payment_12345678123412341234123456789012",
      idempotencyKey: "85300000-0000-4000-8000-000000000853",
      payerEmail: "offline@example.invalid",
    });

    const [, init] = requireFetchCall(fetchMock, 0);
    expect(init.headers).toMatchObject({ "x-idempotency-key": "85300000-0000-4000-8000-000000000853" });
    expect(init.signal).toBeInstanceOf(AbortSignal);

    const service = read("src/server/payments/order-pix-service.ts");
    expect(service).toContain("error.status === 401 || error.status === 403");
    expect(service).toContain("forceRefreshMercadoPagoCredentials(storeId)");
    expect(service).toContain("idempotencyKey: charge.idempotency_key");
    expect(service).toContain("provider.createPixCharge(request)");
  });

  it("maps an expired provider charge and preserves authoritative reconciliation validation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(providerResponse({
      status: "expired",
      detail: "expired",
    })), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new MercadoPagoOrderProvider("APP_USR_offline-test");
    const result = await provider.getOrder("ORD01JHOMOLOG853");
    expect(result.status).toBe("expired");
    expect(result.amountCents).toBe(3790);
    const [, init] = requireFetchCall(fetchMock, 0);
    expect(init.signal).toBeInstanceOf(AbortSignal);

    const service = read("src/server/payments/order-pix-service.ts");
    expect(service).toContain("PIX provider reference mismatch");
    expect(service).toContain("PIX provider amount mismatch");
    expect(service).toContain("PIX provider currency mismatch");
  });

  it("keeps duplicate/out-of-order webhooks financially idempotent", () => {
    const webhook = read("src/server/payments/mercado-pago-webhook-service.ts");
    const pix = read("src/server/payments/order-pix-service.ts");
    const sql = read("supabase/sql/97_order_payment_providers.sql");

    expect(sql).toContain("order_payment_provider_events_replay_unique");
    expect(sql).toContain("unique (store_id, provider, provider_event_id)");
    expect(webhook).toContain('insertError.code !== "23505"');
    expect(webhook).toContain('existing?.status === "processed"');
    expect(webhook).toContain("duplicate: true");
    expect(pix).toContain('const nextStatus = charge.status === "paid" ? "paid" : remote.status');
    expect(pix).toContain('admin.rpc("payment_confirm_internal"');
  });

  it("requires valid webhook signature and uses GET reconciliation rather than trusting body state", () => {
    const webhook = read("src/server/payments/mercado-pago-webhook-service.ts");
    const pix = read("src/server/payments/order-pix-service.ts");

    expect(webhook).toContain("validateMercadoPagoWebhookSignature");
    expect(webhook).toContain("Mercado Pago webhook signature is invalid");
    expect(webhook).toContain("OrderPixService.reconcile(credentials.store_id, dataId)");
    expect(pix).toContain("provider.getOrder(providerOrderId)");
  });

  it("recovers missed webhooks with bounded reconciliation and strict store scoping", () => {
    const reconciliation = read("src/server/payments/order-pix-reconciliation-service.ts");
    const pix = read("src/server/payments/order-pix-service.ts");
    const scheduler = read("supabase/sql/155_mercado_pago_reconciliation_scheduler.sql");

    expect(reconciliation).toContain('.eq("provider", "mercado_pago")');
    expect(reconciliation).toContain('.eq("enabled", true)');
    expect(reconciliation).toContain('.eq("status", "pending")');
    expect(reconciliation).toContain("OrderPixService.reconcile(charge.store_id, charge.provider_order_id)");
    expect(pix).toContain('.eq("store_id", storeId)');
    expect(pix).toContain('.eq("provider_order_id", providerOrderId)');
    expect(scheduler).toContain("*/2 * * * *");
  });

  it("keeps tenant/store A and B isolated across config, charge and webhook paths", () => {
    const config = read("src/server/payments/order-payment-provider-config-service.ts");
    const pix = read("src/server/payments/order-pix-service.ts");
    const webhook = read("src/server/payments/mercado-pago-webhook-service.ts");
    const callback = read("src/app/api/integrations/mercado-pago/oauth/callback/route.ts");

    expect(config).toContain('.eq("organization_id", organizationId)');
    expect(config).toContain('.eq("store_id", storeId)');
    expect(pix).toContain('.eq("organization_id", order.organization_id)');
    expect(pix).toContain('.eq("store_id", order.store_id)');
    expect(webhook).toContain("credentials.store_id");
    expect(callback).toContain("context.storeId !== oauthSession.storeId");
    expect(callback).toContain("context.organizationId !== oauthSession.organizationId");
  });

  it("keeps rollback non-destructive: disable stops new Pix and OAuth disconnect preserves history", () => {
    const config = read("src/server/payments/order-payment-provider-config-service.ts");
    const oauthSql = read("supabase/sql/153_mercado_pago_oauth_connection.sql");
    const providerSql = read("supabase/sql/97_order_payment_providers.sql");

    expect(config).toContain("setCurrentStoreEnabled(enabled: boolean)");
    expect(config).toContain("disconnectOAuthCurrentStore");
    expect(oauthSql).toContain("enabled = false");
    expect(oauthSql).toContain("revoked_at");
    expect(providerSql).toContain("order_payment_provider_charges");
    expect(providerSql).not.toMatch(/delete\s+from\s+public\.order_payment_provider_charges/i);
  });
});
