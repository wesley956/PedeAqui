import { describe, expect, it } from "vitest";
import { deriveOrderAccessToken, hashOrderAccessToken, orderCookieName } from "@/server/orders/order-token";

describe("order public access token", () => {
  it("is deterministic for retry safety but separated from the cart token", () => {
    const cartToken = "cart-secret-token-123";
    const first = deriveOrderAccessToken(cartToken);
    const second = deriveOrderAccessToken(cartToken);
    expect(first).toBe(second);
    expect(first).not.toBe(cartToken);
  });

  it("stores only a sha256 hash", () => {
    const token = deriveOrderAccessToken("another-cart-secret");
    expect(hashOrderAccessToken(token)).toMatch(/^[0-9a-f]{64}$/);
  });

  it("scopes cookies by store and order", () => {
    expect(orderCookieName("Loja-Centro", "123e4567-e89b-12d3-a456-426614174000"))
      .toBe("pa_order_loja-centro_123e4567-e89b-12d3-a456-426614174000");
  });
});
