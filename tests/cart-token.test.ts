import { describe, expect, it } from "vitest";
import { cartCookieName, createCartToken, hashCartToken } from "@/server/cart/cart-token";

describe("cart token", () => {
  it("generates an opaque token and stores only a deterministic sha256 hash", () => {
    const token = createCartToken();
    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(hashCartToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashCartToken(token)).not.toContain(token);
  });

  it("isolates cookie names by public store slug", () => {
    expect(cartCookieName("Minha-Loja!" )).toBe("pa_cart_minha-loja-");
  });
});
