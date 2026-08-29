import "server-only";

import { OrderPaymentProviderConfigService, type OrderPaymentProviderCredentials } from "@/server/payments/order-payment-provider-config-service";
import { refreshMercadoPagoOAuthToken } from "@/server/payments/providers/mercado-pago-oauth";

const REFRESH_SKEW_MS = 5 * 60 * 1000;

function isAccessTokenFresh(credentials: OrderPaymentProviderCredentials) {
  if (credentials.connection_mode !== "oauth") return true;
  if (!credentials.access_token_expires_at) return false;
  const expiresAt = new Date(credentials.access_token_expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt > Date.now() + REFRESH_SKEW_MS;
}

function assertUsable(credentials: OrderPaymentProviderCredentials | null) {
  if (!credentials?.enabled) throw new Error("Online PIX provider is disabled");
  if (credentials.revoked_at) throw new Error("Mercado Pago OAuth authorization is revoked");
  return credentials;
}

export async function getUsableMercadoPagoCredentials(storeId: string) {
  const current = assertUsable(await OrderPaymentProviderConfigService.credentials(storeId, "mercado_pago"));
  if (current.connection_mode === "manual" || isAccessTokenFresh(current)) return current;
  if (!current.refresh_token) throw new Error("Mercado Pago OAuth refresh token is missing");

  let token;
  try {
    token = await refreshMercadoPagoOAuthToken(current.refresh_token);
  } catch (error) {
    // A parallel request may have refreshed and rotated the token first. Re-read
    // before surfacing the provider error so serverless concurrency stays safe.
    const latest = assertUsable(await OrderPaymentProviderConfigService.credentials(storeId, "mercado_pago"));
    if (latest.updated_at !== current.updated_at && isAccessTokenFresh(latest)) return latest;
    throw error;
  }

  const accessTokenExpiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString();
  try {
    await OrderPaymentProviderConfigService.persistOAuthRefresh({
      storeId,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      accessTokenExpiresAt,
      expectedUpdatedAt: current.updated_at,
    });
  } catch (error) {
    // Optimistic concurrency in the RPC prevents an older refresh response from
    // overwriting a newer rotated refresh token.
    const latest = assertUsable(await OrderPaymentProviderConfigService.credentials(storeId, "mercado_pago"));
    if (latest.updated_at !== current.updated_at && isAccessTokenFresh(latest)) return latest;
    throw error;
  }

  const refreshed = assertUsable(await OrderPaymentProviderConfigService.credentials(storeId, "mercado_pago"));
  if (!isAccessTokenFresh(refreshed)) throw new Error("Mercado Pago OAuth token refresh did not persist a usable token");
  return refreshed;
}
