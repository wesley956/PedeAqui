import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { CheckoutError, CheckoutService } from "@/server/checkout/checkout-service";
describe("payment email validation", () => {
  it.each(["invalid", "a@", "", `${"a".repeat(250)}@example.com`])("rejects invalid payment email before touching the cart: %s", async (email) => {
    const result = CheckoutService.savePaymentEmail("fake-store", "fake-token", email);
    await expect(result).rejects.toMatchObject({ code: "invalid_payment_email" });
    await expect(result).rejects.toBeInstanceOf(CheckoutError);
  });
});
