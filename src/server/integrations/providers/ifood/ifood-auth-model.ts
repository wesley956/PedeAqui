import { createHash, randomBytes } from "node:crypto";

export const IFOOD_ENVIRONMENTS = ["sandbox", "production"] as const;
export type IfoodEnvironment = (typeof IFOOD_ENVIRONMENTS)[number];

export const IFOOD_AUTH_MODES = ["centralized", "distributed"] as const;
export type IfoodAuthMode = (typeof IFOOD_AUTH_MODES)[number];

export type IfoodConnectionState =
  | "not_connected"
  | "starting"
  | "awaiting_authorization"
  | "exchanging_token"
  | "resolving_merchant"
  | "health_checking"
  | "connected"
  | "action_required"
  | "temporarily_unavailable"
  | "revoked"
  | "disconnected";

export type IfoodApplicationCredentials = {
  clientId: string;
  clientSecret: string;
  authMode: IfoodAuthMode;
};

export type IfoodTokenBundle = {
  accessToken: string;
  tokenType: string;
  expiresAt: string;
  refreshToken: string | null;
};

export type IfoodMerchant = {
  id: string;
  name: string;
  corporateName?: string | null;
};

export type IfoodMerchantHealth = {
  available?: boolean;
  state?: string;
  raw?: unknown;
};

export type IfoodConnectionAccount = {
  id: string;
  organizationId: string;
  environment: IfoodEnvironment;
  authMode: IfoodAuthMode;
  connectionState: IfoodConnectionState;
  status: "connected" | "attention" | "action_required" | "unavailable" | "disconnected";
};

export type IfoodAuthorizationPrompt = {
  kind: "authorization_required";
  integrationAccountId: string;
  sessionId: string;
  state: string;
  userCode: string;
  verificationUrl: string | null;
  verificationUrlComplete: string;
  expiresAt: string;
};

export type IfoodMerchantSelection = {
  kind: "merchant_selection";
  integrationAccountId: string;
  merchants: IfoodMerchant[];
};

export type IfoodStartConnectionResult = IfoodAuthorizationPrompt | IfoodMerchantSelection;

export function isIfoodEnvironment(value: unknown): value is IfoodEnvironment {
  return typeof value === "string" && (IFOOD_ENVIRONMENTS as readonly string[]).includes(value);
}

export function isIfoodAuthMode(value: unknown): value is IfoodAuthMode {
  return typeof value === "string" && (IFOOD_AUTH_MODES as readonly string[]).includes(value);
}

export function parseIfoodApplicationCredentials(value: unknown): IfoodApplicationCredentials {
  if (!value || typeof value !== "object") throw new Error("iFood application credentials are not configured");
  const row = value as Record<string, unknown>;
  if (typeof row.clientId !== "string" || row.clientId.length < 8) throw new Error("iFood client id is not configured");
  if (typeof row.clientSecret !== "string" || row.clientSecret.length < 8) throw new Error("iFood client secret is not configured");
  if (!isIfoodAuthMode(row.authMode)) throw new Error("iFood auth mode is not configured");
  return { clientId: row.clientId, clientSecret: row.clientSecret, authMode: row.authMode };
}

export function tokenExpiresAt(expiresInSeconds: number, now = Date.now()): string {
  const safeSeconds = Number.isFinite(expiresInSeconds) ? Math.max(1, expiresInSeconds) : 1;
  return new Date(now + safeSeconds * 1000).toISOString();
}

export function tokenNeedsRefresh(token: IfoodTokenBundle | null, now = Date.now(), safetyWindowMs = 5 * 60 * 1000): boolean {
  if (!token?.accessToken) return true;
  const expiry = new Date(token.expiresAt).getTime();
  return !Number.isFinite(expiry) || expiry - now <= safetyWindowMs;
}

export function tokenFingerprint(token: string): string {
  return createHash("sha256").update(token).digest("hex").slice(0, 12);
}

export function generateAuthorizationState(): { state: string; stateHash: string } {
  const state = randomBytes(32).toString("base64url");
  return { state, stateHash: hashAuthorizationState(state) };
}

export function hashAuthorizationState(state: string): string {
  return createHash("sha256").update(state).digest("hex");
}

export function sanitizeIfoodError(value: unknown): string {
  const text = value instanceof Error ? value.message : String(value ?? "unknown error");
  return text
    .replace(/Bearer\s+\S+/gi, "Bearer [protected]")
    .replace(/(clientSecret|accessToken|refreshToken|authorizationCode|authorizationCodeVerifier)\s*[:=]\s*[^\s,}&]+/gi, "$1=[protected]")
    .replace(/[A-Za-z0-9_-]{48,}/g, "[protected]")
    .slice(0, 240);
}

export function safeConnectionMetadata(token: IfoodTokenBundle): Record<string, unknown> {
  return {
    tokenFingerprint: tokenFingerprint(token.accessToken),
    tokenExpiresAt: token.expiresAt,
    hasRefreshToken: Boolean(token.refreshToken),
  };
}
