import { createHash, createHmac, randomBytes } from "node:crypto";

export function createPrintAgentToken() {
  return randomBytes(32).toString("base64url");
}

export function derivePrintAgentToken(agentId: string, credentialVersion: number, secret: string) {
  if (!agentId) throw new Error("Print Agent id is required");
  if (!Number.isInteger(credentialVersion) || credentialVersion < 1) throw new Error("Print Agent credential version is invalid");
  if (!secret) throw new Error("Print Agent credential secret is not configured");
  return createHmac("sha256", secret)
    .update(`pedeaqui-print-agent:${agentId}:${credentialVersion}`, "utf8")
    .digest("base64url");
}

export function hashPrintAgentToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function bearerToken(authorization: string | null) {
  if (!authorization) return null;
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}
