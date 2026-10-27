import { NextResponse } from "next/server";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { logger } from "@/server/observability/logger";
import { OrderPaymentProviderConfigService } from "@/server/payments/order-payment-provider-config-service";
import { mercadoPagoOAuthAppUrl } from "@/server/payments/mercado-pago-oauth-navigation";
import {
  exchangeMercadoPagoAuthorizationCode,
  mercadoPagoWebhookSecret,
  readMercadoPagoOAuthSession,
} from "@/server/payments/providers/mercado-pago-oauth";

const OAUTH_COOKIE = "pedeaqui_mp_oauth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  let status = "session_invalid";
  let stage = "validate_session";

  try {
    if (url.searchParams.get("error")) {
      status = "authorization_denied";
      return redirectWithClearedCookie(status);
    }

    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const cookieHeader = request.headers.get("cookie") ?? "";
    const cookieValue = readCookie(cookieHeader, OAUTH_COOKIE);
    if (!code || !state || !cookieValue) throw new Error("Missing Mercado Pago OAuth callback state");

    const oauthSession = readMercadoPagoOAuthSession(cookieValue);
    if (oauthSession.state !== state) throw new Error("Mercado Pago OAuth state mismatch");

    status = "not_authorized";
    stage = "authorize_store";
    const context = await authorize(PERMISSIONS.PAYMENTS_MANAGE);
    status = "context_changed";
    if (!context.storeId
      || context.storeId !== oauthSession.storeId
      || context.organizationId !== oauthSession.organizationId) {
      throw new Error("Mercado Pago OAuth tenant context changed");
    }

    status = "token_exchange_failed";
    stage = "exchange_token";
    const token = await exchangeMercadoPagoAuthorizationCode({
      code,
      verifier: oauthSession.verifier,
    });
    const accessTokenExpiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString();

    status = "connection_save_failed";
    stage = "save_connection";
    await OrderPaymentProviderConfigService.connectOAuthCurrentStore({
      environment: token.live_mode ? "production" : "test",
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      webhookSecret: mercadoPagoWebhookSecret(),
      providerAccountId: String(token.user_id),
      accessTokenExpiresAt,
    });
    status = "connected";
  } catch (error) {
    logger.warn("mercado_pago_oauth_callback_failed", {
      stage,
      errorType: error instanceof Error ? error.name : "unknown",
    });
  }

  return redirectWithClearedCookie(status);
}

function redirectWithClearedCookie(status: string) {
  const response = NextResponse.redirect(mercadoPagoOAuthAppUrl(`/configuracoes/pagamentos?mercado_pago=${encodeURIComponent(status)}`));
  response.cookies.set(OAUTH_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}

function readCookie(header: string, name: string) {
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}
