import { createHash, randomBytes } from "node:crypto";

export const CUSTOMER_RECOGNITION_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;

export function customerRecognitionCookieName(storeSlug: string) {
  const safeSlug = storeSlug.toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 80);
  return `pedeaqui_customer_${safeSlug}`;
}

export function createCustomerRecognitionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashCustomerRecognitionToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
