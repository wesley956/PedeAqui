import { createHash } from "node:crypto";

export function deriveOrderAccessToken(cartToken: string) {
  return createHash("sha256")
    .update(`pedeaqui-order-access-v1:${cartToken}`, "utf8")
    .digest("base64url");
}

export function hashOrderAccessToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function orderCookieName(slug: string, orderId: string) {
  const safeSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 40);
  const safeOrder = orderId.toLowerCase().replace(/[^a-f0-9-]/g, "").slice(0, 36);
  return `pa_order_${safeSlug}_${safeOrder}`;
}
