import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * PagBank Connect: o restaurante autoriza o PedeAqui a criar e consultar cobranças
 * na conta PagBank dele (https://developer.pagbank.com.br/docs/connect).
 *
 * Variáveis de ambiente:
 * - PAGBANK_ENVIRONMENT: "sandbox" (padrão) ou "production"
 * - PAGBANK_CLIENT_ID e PAGBANK_CLIENT_SECRET: da aplicação criada no PagBank
 * - PAGBANK_PLATFORM_TOKEN: token da conta PagBank do PedeAqui (cabeçalho Authorization das rotas /oauth2)
 * - PAGBANK_OAUTH_REDIRECT_URI: https://<domínio>/api/integrations/pagbank/oauth/callback
 */

const OAUTH_SESSION_TTL_MS = 10 * 60 * 1000;
const SCOPES = ["payments.read", "payments.create", "accounts.read"];

export type PagBankEnvironment = "sandbox" | "production";

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  token_type: z.string().optional(),
  expires_in: z.union([z.number(), z.string()]).transform((value) => {
    const seconds = Number(value);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : 3600;
  }),
  scope: z.string().optional(),
  account_id: z.string().min(1).optional(),
});

export type PagBankToken = z.infer<typeof tokenResponseSchema>;

type OAuthSession = { state: string; organizationId: string; storeId: string; expiresAt: number };

type RequiredName = "PAGBANK_CLIENT_ID" | "PAGBANK_CLIENT_SECRET" | "PAGBANK_PLATFORM_TOKEN" | "PAGBANK_OAUTH_REDIRECT_URI";

function required(name: RequiredName) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`PagBank Connect is not configured: ${name}`);
  return value;
}

export function pagBankEnvironment(): PagBankEnvironment {
  return process.env.PAGBANK_ENVIRONMENT?.trim() === "production" ? "production" : "sandbox";
}

export function pagBankApiBase(environment: PagBankEnvironment = pagBankEnvironment()) {
  return environment === "production" ? "https://api.pagseguro.com" : "https://sandbox.api.pagseguro.com";
}

function authorizeBase(environment: PagBankEnvironment) {
  return environment === "production" ? "https://connect.pagbank.com.br/oauth2/authorize" : "https://connect.sandbox.pagbank.com.br/oauth2/authorize";
}

export function isPagBankConnectConfigured() {
  return (["PAGBANK_CLIENT_ID", "PAGBANK_CLIENT_SECRET", "PAGBANK_PLATFORM_TOKEN", "PAGBANK_OAUTH_REDIRECT_URI"] as const)
    .every((name) => Boolean(process.env[name]?.trim()));
}

/** Token aleatório que vai na URL de notificação da loja e prova que a chamada veio do link que só o PagBank conhece. */
export function createPagBankNotificationSecret() {
  return randomBytes(32).toString("base64url");
}

export function createPagBankOAuthSession(input: { organizationId: string; storeId: string }) {
  const session: OAuthSession = {
    state: randomBytes(32).toString("hex").slice(0, 64),
    organizationId: input.organizationId,
    storeId: input.storeId,
    expiresAt: Date.now() + OAUTH_SESSION_TTL_MS,
  };
  return { session, cookieValue: signSession(session) };
}

export function buildPagBankAuthorizationUrl(input: { state: string; environment?: PagBankEnvironment }) {
  const url = new URL(authorizeBase(input.environment ?? pagBankEnvironment()));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", required("PAGBANK_CLIENT_ID"));
  url.searchParams.set("redirect_uri", required("PAGBANK_OAUTH_REDIRECT_URI"));
  url.searchParams.set("state", input.state);
  // O PagBank separa escopos com "+"; URLSearchParams transformaria "+" em espaço, então o valor vai pronto.
  return `${url.toString()}&scope=${SCOPES.join("+")}`;
}

export function readPagBankOAuthSession(cookieValue: string): OAuthSession {
  const [encoded, suppliedSignature, ...rest] = cookieValue.split(".");
  if (!encoded || !suppliedSignature || rest.length) throw new Error("Invalid PagBank OAuth session");
  const supplied = Buffer.from(suppliedSignature, "base64url");
  const expected = Buffer.from(sign(encoded), "base64url");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) throw new Error("Invalid PagBank OAuth session signature");
  const parsed = z.object({
    state: z.string().min(32).max(128),
    organizationId: z.string().uuid(),
    storeId: z.string().uuid(),
    expiresAt: z.number().int().positive(),
  }).parse(JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")));
  if (parsed.expiresAt < Date.now()) throw new Error("PagBank OAuth session expired");
  return parsed;
}

export async function exchangePagBankAuthorizationCode(code: string, fetcher: typeof fetch = fetch) {
  return requestToken("/oauth2/token", {
    grant_type: "authorization_code",
    code,
    redirect_uri: required("PAGBANK_OAUTH_REDIRECT_URI"),
  }, fetcher);
}

/** Cada renovação devolve um refresh token novo e invalida o anterior. */
export async function refreshPagBankToken(refreshToken: string, fetcher: typeof fetch = fetch) {
  return requestToken("/oauth2/refresh", { grant_type: "refresh_token", refresh_token: refreshToken }, fetcher);
}

async function requestToken(path: string, body: Record<string, string>, fetcher: typeof fetch) {
  const response = await fetcher(`${pagBankApiBase()}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "application/json",
      authorization: `Bearer ${required("PAGBANK_PLATFORM_TOKEN")}`,
      X_CLIENT_ID: required("PAGBANK_CLIENT_ID"),
      X_CLIENT_SECRET: required("PAGBANK_CLIENT_SECRET"),
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`PagBank token request failed (${response.status})`);
  return tokenResponseSchema.parse(payload);
}

function signSession(session: OAuthSession) {
  const encoded = Buffer.from(JSON.stringify(session), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded)}`;
}

function sign(value: string) {
  return createHmac("sha256", required("PAGBANK_CLIENT_SECRET")).update(value).digest("base64url");
}
