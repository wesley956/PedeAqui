import type { IfoodApplicationCredentials, IfoodMerchant, IfoodMerchantHealth } from "@/server/integrations/providers/ifood/ifood-auth-model";
import { tokenExpiresAt, type IfoodTokenBundle } from "@/server/integrations/providers/ifood/ifood-auth-model";

const DEFAULT_BASE_URL = "https://merchant-api.ifood.com.br";

export class IfoodHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = "IfoodHttpError";
  }
}

type FetchLike = typeof fetch;

type TokenResponse = {
  accessToken?: unknown;
  type?: unknown;
  expiresIn?: unknown;
  refreshToken?: unknown;
};

type UserCodeResponse = {
  userCode?: unknown;
  authorizationCodeVerifier?: unknown;
  verificationUrl?: unknown;
  verificationUrlComplete?: unknown;
  expiresIn?: unknown;
};

function asString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asPositiveNumber(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

async function parseError(response: Response): Promise<{ code: string | null; message: string }> {
  try {
    const body = (await response.json()) as { error?: { code?: unknown; message?: unknown }; message?: unknown };
    return {
      code: asString(body?.error?.code),
      message: asString(body?.error?.message) ?? asString(body?.message) ?? `iFood HTTP ${response.status}`,
    };
  } catch {
    return { code: null, message: `iFood HTTP ${response.status}` };
  }
}

export class IfoodAuthHttpClient {
  constructor(
    private readonly fetchImpl: FetchLike = fetch,
    private readonly baseUrl = DEFAULT_BASE_URL,
  ) {}

  private async requestJson<T>(path: string, init: RequestInit): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        accept: "application/json",
        ...(init.headers ?? {}),
      },
      signal: init.signal ?? AbortSignal.timeout(12_000),
    });
    if (!response.ok) {
      const failure = await parseError(response);
      const retryable = response.status === 429 || response.status >= 500;
      throw new IfoodHttpError(failure.message, response.status, retryable, failure.code);
    }
    return (await response.json()) as T;
  }

  private async tokenRequest(params: Record<string, string>, previousRefreshToken: string | null = null): Promise<IfoodTokenBundle> {
    const body = new URLSearchParams(params);
    const response = await this.requestJson<TokenResponse>("/authentication/v1.0/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const accessToken = asString(response.accessToken);
    const expiresIn = asPositiveNumber(response.expiresIn);
    if (!accessToken || !expiresIn) throw new Error("iFood token response is incomplete");
    return {
      accessToken,
      tokenType: asString(response.type) ?? "bearer",
      expiresAt: tokenExpiresAt(expiresIn),
      refreshToken: asString(response.refreshToken) ?? previousRefreshToken,
    };
  }

  exchangeClientCredentials(credentials: IfoodApplicationCredentials): Promise<IfoodTokenBundle> {
    return this.tokenRequest({
      grantType: "client_credentials",
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
    });
  }

  async requestUserCode(clientId: string): Promise<{
    userCode: string;
    authorizationCodeVerifier: string;
    verificationUrl: string | null;
    verificationUrlComplete: string;
    expiresIn: number;
  }> {
    const response = await this.requestJson<UserCodeResponse>("/authentication/v1.0/oauth/userCode", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ clientId }),
    });
    const userCode = asString(response.userCode);
    const authorizationCodeVerifier = asString(response.authorizationCodeVerifier);
    const verificationUrlComplete = asString(response.verificationUrlComplete);
    const expiresIn = asPositiveNumber(response.expiresIn);
    if (!userCode || !authorizationCodeVerifier || !verificationUrlComplete || !expiresIn) {
      throw new Error("iFood user-code response is incomplete");
    }
    return {
      userCode,
      authorizationCodeVerifier,
      verificationUrl: asString(response.verificationUrl),
      verificationUrlComplete,
      expiresIn,
    };
  }

  exchangeAuthorizationCode(input: {
    credentials: IfoodApplicationCredentials;
    authorizationCode: string;
    authorizationCodeVerifier: string;
  }): Promise<IfoodTokenBundle> {
    return this.tokenRequest({
      grantType: "authorization_code",
      clientId: input.credentials.clientId,
      clientSecret: input.credentials.clientSecret,
      authorizationCode: input.authorizationCode,
      authorizationCodeVerifier: input.authorizationCodeVerifier,
    });
  }

  refreshToken(credentials: IfoodApplicationCredentials, refreshToken: string): Promise<IfoodTokenBundle> {
    return this.tokenRequest({
      grantType: "refresh_token",
      clientId: credentials.clientId,
      clientSecret: credentials.clientSecret,
      refreshToken,
    }, refreshToken);
  }

  async listMerchants(accessToken: string): Promise<IfoodMerchant[]> {
    const response = await this.requestJson<unknown>("/merchant/v1.0/merchants?page=1&size=100", {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const rows = Array.isArray(response)
      ? response
      : response && typeof response === "object" && Array.isArray((response as { merchants?: unknown }).merchants)
        ? (response as { merchants: unknown[] }).merchants
        : [];
    return rows.flatMap((row) => {
      if (!row || typeof row !== "object") return [];
      const item = row as Record<string, unknown>;
      const id = asString(item.id);
      const name = asString(item.name);
      if (!id || !name) return [];
      return [{ id, name, corporateName: asString(item.corporateName) }];
    });
  }

  async getMerchant(accessToken: string, merchantId: string): Promise<IfoodMerchant> {
    const row = await this.requestJson<Record<string, unknown>>(`/merchant/v1.0/merchants/${encodeURIComponent(merchantId)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const id = asString(row.id);
    const name = asString(row.name);
    if (!id || !name) throw new Error("iFood merchant response is incomplete");
    return { id, name, corporateName: asString(row.corporateName) };
  }

  async getMerchantHealth(accessToken: string, merchantId: string): Promise<IfoodMerchantHealth> {
    const raw = await this.requestJson<unknown>(`/merchant/v1.0/merchants/${encodeURIComponent(merchantId)}/status`, {
      method: "GET",
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (Array.isArray(raw)) {
      const first = raw.find((item) => item && typeof item === "object") as Record<string, unknown> | undefined;
      return { available: typeof first?.available === "boolean" ? first.available : undefined, state: asString(first?.state) ?? undefined, raw };
    }
    if (raw && typeof raw === "object") {
      const row = raw as Record<string, unknown>;
      return { available: typeof row.available === "boolean" ? row.available : undefined, state: asString(row.state) ?? undefined, raw };
    }
    return { raw };
  }
}
