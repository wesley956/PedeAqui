import "server-only";

import {
  OrderPaymentProviderConfigService,
  type OrderPaymentProviderCredentials,
} from "@/server/payments/order-payment-provider-config-service";
import { refreshPagBankToken } from "@/server/payments/providers/pagbank-connect";

const REFRESH_SKEW_MS = 5 * 60 * 1000;

function isAccessTokenFresh(credentials: OrderPaymentProviderCredentials) {
  if (!credentials.access_token_expires_at) return false;
  const expiresAt = new Date(credentials.access_token_expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt > Date.now() + REFRESH_SKEW_MS;
}

function assertUsable(credentials: OrderPaymentProviderCredentials | null) {
  if (!credentials?.enabled) throw new Error("Online PIX provider is disabled");
  if (credentials.revoked_at) throw new Error("PagBank authorization is revoked");
  return credentials;
}

async function load(storeId: string) {
  return assertUsable(await OrderPaymentProviderConfigService.credentials(storeId, "pagbank"));
}

async function refreshCredentials(storeId: string, current: OrderPaymentProviderCredentials) {
  if (!current.refresh_token) throw new Error("PagBank refresh token is missing");

  let token;
  try {
    token = await refreshPagBankToken(current.refresh_token);
  } catch (error) {
    // Outra requisição pode ter renovado primeiro: o refresh token antigo deixa de valer.
    const latest = await load(storeId);
    if (latest.updated_at !== current.updated_at && isAccessTokenFresh(latest)) return latest;
    throw error;
  }

  try {
    await OrderPaymentProviderConfigService.persistPagBankRefresh({
      storeId,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      accessTokenExpiresAt: new Date(Date.now() + token.expires_in * 1000).toISOString(),
      expectedUpdatedAt: current.updated_at,
    });
  } catch (error) {
    const latest = await load(storeId);
    if (latest.updated_at !== current.updated_at && isAccessTokenFresh(latest)) return latest;
    throw error;
  }

  return load(storeId);
}

export async function getUsablePagBankCredentials(storeId: string) {
  const current = await load(storeId);
  if (isAccessTokenFresh(current)) return current;
  return refreshCredentials(storeId, current);
}

export async function forceRefreshPagBankCredentials(storeId: string) {
  return refreshCredentials(storeId, await load(storeId));
}
