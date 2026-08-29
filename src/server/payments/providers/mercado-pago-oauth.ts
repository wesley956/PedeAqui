import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

const AUTHORIZATION_URL = "https://auth.mercadopago.com/authorization";
const TOKEN_URL = "https://api.mercadopago.com/oauth/token";
const OAUTH_SESSION_TTL_MS = 10 * 60 * 1000;

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
  expires_in: z.number().int().positive(),
  scope: z.string().optional(),
  user_id: z.union([z.number(), z.string()]),
  refresh_token: z.string().min(1),
  live_mode: z.boolean().optional().default(true),
});

export type MercadoPagoOAuthToken = z.infer<typeof tokenResponseSchema>;

type OAuthSession = {
  state: string;
  verifier: string;
  organizationId: string;
  storeId: string;
  expiresAt: number;
};

function required(name: "MERCADO_PAGO_CLIENT_ID" | "MERCADO_PAGO_CLIENT_SECRET" | "MERCADO_PAGO_OAUTH_REDIRECT_URI" | "MERCADO_PAGO_ORDER_WEBHOOK_SECRET") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Mercado Pago OAuth is not configured: ${name}`);
  return value;
}

function clientId() { return required("MERCADO_PAGO_CLIENT_ID"); }
function clientSecret() { return required("MERCADO_PAGO_CLIENT_SECRET"); }
export function mercadoPagoOAuthRedirectUri() { return required("MERCADO_PAGO_OAUTH_REDIRECT_URI"); }
export function mercadoPagoWebhookSecret() { return required("MERCADO_PAGO_ORDER_WEBHOOK_SECRET"); }

export function isMercadoPagoOAuthConfigured() {
  return Boolean(
    process.env.MERCADO_PAGO_CLIENT_ID?.trim()
    && process.env.MERCADO_PAGO_CLIENT_SECRET?.trim()
    && process.env.MERCADO_PAGO_OAUTH_REDIRECT_URI?.trim()
    && process.env.MERCADO_PAGO_ORDER_WEBHOOK_SECRET?.trim(),
  );
}

export function createMercadoPagoOAuthSession(input: { organizationId: string; storeId: string }) {
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(64).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  const session: OAuthSession = {
    state,
    verifier,
    organizationId: input.organizationId,
    storeId: input.storeId,
    expiresAt: Date.now() + OAUTH_SESSION_TTL_MS,
  };
  return {
    session,
    challenge,
    cookieValue: signSession(session),
  };
}

export function buildMercadoPagoAuthorizationUrl(input: { state: string; challenge: string }) {
  const url = new URL(AUTHORIZATION_URL);
  url.searchParams.set("client_id", clientId());
  url.searchParams.set("response_type", "code");
  url.searchParams.set("platform_id", "mp");
  url.searchParams.set("state", input.state);
  url.searchParams.set("redirect_uri", mercadoPagoOAuthRedirectUri());
  url.searchParams.set("code_challenge", input.challenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url;
}

export function readMercadoPagoOAuthSession(cookieValue: string): OAuthSession {
  const [encoded, suppliedSignature, ...rest] = cookieValue.split(".");
  if (!encoded || !suppliedSignature || rest.length) throw new Error("Invalid Mercado Pago OAuth session");
  const expectedSignature = sign(encoded);
  const supplied = Buffer.from(suppliedSignature, "base64url");
  const expected = Buffer.from(expectedSignature, "base64url");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new Error("Invalid Mercado Pago OAuth session signature");
  }
  const parsed = z.object({
    state: z.string().min(32),
    verifier: z.string().min(43).max(128),
    organizationId: z.string().uuid(),
    storeId: z.string().uuid(),
    expiresAt: z.number().int().positive(),
  }).parse(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")));
  if (parsed.expiresAt < Date.now()) throw new Error("Mercado Pago OAuth session expired");
  return parsed;
}

export async function exchangeMercadoPagoAuthorizationCode(input: { code: string; verifier: string }) {
  return requestToken({
    grant_type: "authorization_code",
    client_id: clientId(),
    client_secret: clientSecret(),
    code: input.code,
    redirect_uri: mercadoPagoOAuthRedirectUri(),
    code_verifier: input.verifier,
  });
}

export async function refreshMercadoPagoOAuthToken(refreshToken: string) {
  return requestToken({
    grant_type: "refresh_token",
    client_id: clientId(),
    client_secret: clientSecret(),
    refresh_token: refreshToken,
  });
}

async function requestToken(body: Record<string, string>) {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const code = z.object({ error: z.string().optional() }).safeParse(payload);
    throw new Error(`Mercado Pago OAuth token exchange failed${code.success && code.data.error ? `: ${code.data.error}` : ""}`);
  }
  return tokenResponseSchema.parse(payload);
}

function signSession(session: OAuthSession) {
  const encoded = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

function sign(value: string) {
  return createHmac("sha256", clientSecret()).update(value).digest("base64url");
}
