import { createHash, randomBytes } from "node:crypto";

export function createPrintAgentToken() {
  return randomBytes(32).toString("base64url");
}

export function hashPrintAgentToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function bearerToken(authorization: string | null) {
  if (!authorization) return null;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}
