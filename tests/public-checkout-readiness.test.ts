import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cartItemQuantitySchema } from "@/server/cart/schemas";
import { checkoutAddressSchema, checkoutIdentitySchema } from "@/server/checkout/schemas";
import { parseMoneyToCents } from "@/server/catalog/money";

const checkoutService = readFileSync("src/server/checkout/checkout-service.ts", "utf8");
const checkoutActions = readFileSync("src/features/checkout/actions.ts", "utf8");
const checkoutPage = readFileSync("src/app/m/[slug]/checkout/page.tsx", "utf8");
const cartActions = readFileSync("src/features/cart/actions.ts", "utf8");
const deliveryPage = readFileSync("src/app/(app)/configuracoes/entrega/page.tsx", "utf8");

describe("public cart and checkout readiness [PA-DIAG-026-030]", () => {
  it("rejects invalid cart and identity inputs while allowing an omitted CEP", () => {
    expect(cartItemQuantitySchema.safeParse({ storeSlug: "santa-rita", itemId: crypto.randomUUID(), quantity: 0 }).success).toBe(false);
    expect(checkoutIdentitySchema.safeParse({ name: "A", phone: "123", email: "not-an-email" }).success).toBe(false);
    expect(checkoutAddressSchema.safeParse({ postalCode: "1", street: "Rua A", number: "10", district: "Centro", city: "Nova Odessa", state: "SP" }).success).toBe(false);
    expect(checkoutAddressSchema.safeParse({ postalCode: "", street: "Rua A", number: "10", district: "Centro", city: "Nova Odessa", state: "SP" }).success).toBe(true);
    expect(checkoutAddressSchema.safeParse({ postalCode: null, street: "Rua A", number: "10", district: "Centro", city: "Nova Odessa", state: "SP" }).success).toBe(true);
    expect(() => parseMoneyToCents("dez reais")).toThrow("Invalid money value");
  });

  it("turns validation failures into customer-facing redirects", () => {
    for (const code of ["invalid_identity", "invalid_fulfillment", "invalid_address", "invalid_payment"]) {
      expect(checkoutService).toContain(`"${code}"`);
      expect(checkoutPage).toContain(`${code}:`);
    }
    expect(checkoutActions).toContain("new CheckoutError(\"invalid_change\"");
    expect(cartActions).toContain("cartItemQuantitySchema.safeParse");
    expect(cartActions).toContain("cart_remove_failed");
  });

  it("loads independent checkout data concurrently and resolves module state server-side", () => {
    expect(checkoutService).toContain("const [session, methods, menu, recognizedCustomer, deliveryNeighborhoods, growthEnabled] = await Promise.all");
    expect(checkoutService).toContain("const [cartResult, menu] = await Promise.all");
    expect(checkoutService).toContain("StoreModuleStateService.isEnabled");
    expect(checkoutPage).toContain("const data = await CheckoutService.load");
  });

  it("does not present distance as enforced without geocoding", () => {
    expect(deliveryPage).toContain("O checkout não usa distância sem geocodificação");
    expect(deliveryPage).toContain("Cobertura validada por bairro");
    expect(deliveryPage).not.toContain('name="maxDistanceKm"');
  });
});
