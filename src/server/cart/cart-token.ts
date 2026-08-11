import { createHash, randomBytes } from "node:crypto";

export function createCartToken() {
  return randomBytes(32).toString("base64url");
}

export function hashCartToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function cartCookieName(slug: string) {
  const safe = slug.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 60);
  return `pa_cart_${safe}`;
}
