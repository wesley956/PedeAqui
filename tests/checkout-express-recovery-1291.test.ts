import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ committed: false }));
const mocks = vi.hoisted(() => ({
  recover: vi.fn(), confirm: vi.fn(), save: vi.fn(), load: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "opaque-cart-token" }) }) }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(`redirect:${url}`); } }));
vi.mock("@/features/cart/actions", () => ({ removeCartItemAction: vi.fn(), updateCartQuantityAction: vi.fn() }));
vi.mock("@/features/checkout/benefit-actions", () => ({ applyCheckoutBenefitsAction: vi.fn(), clearCheckoutBenefitsAction: vi.fn() }));
vi.mock("@/features/orders/actions", () => ({ recoverCheckoutOrderAction: mocks.recover }));
vi.mock("@/server/observability/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/features/checkout/confirm-order-action", () => ({ confirmCheckoutOrderAction: mocks.confirm }));
vi.mock("@/server/checkout/checkout-service", () => {
  class CheckoutError extends Error { constructor(public code: string, message: string) { super(message); } }
  return { CheckoutError, CheckoutService: {
    saveFulfillment: mocks.save, saveIdentity: mocks.save, saveAddress: mocks.save,
    savePayment: mocks.save, saveSchedule: mocks.save, load: mocks.load,
  } };
});
import { CheckoutError } from "@/server/checkout/checkout-service";
import { submitExpressCheckoutAction } from "@/features/checkout/express-actions";

function form(expected = "2800") {
  const data = new FormData();
  Object.entries({ storeSlug: "loja-teste", fulfillmentType: "pickup", name: "Teste", phone: "19999999999", paymentMethod: "cash", expectedTotalCents: expected }).forEach(([key, value]) => data.set(key, value));
  return data;
}

describe("express checkout recovery after a lost response (#1291)", () => {
  beforeEach(() => {
    vi.clearAllMocks(); state.committed = false;
    mocks.recover.mockImplementation(async () => {
      if (state.committed) throw new Error("redirect:/m/loja-teste/pedido/existing");
    });
    mocks.save.mockImplementation(async () => {
      if (state.committed) throw new CheckoutError("cart_empty", "Carrinho já finalizado");
    });
    mocks.load.mockResolvedValue({ cart: { total_cents: 2800 } });
    mocks.confirm.mockImplementation(async () => { state.committed = true; throw new Error("lost response after commit"); });
  });

  it("recovers before attempting to save a converted cart on retry", async () => {
    await expect(submitExpressCheckoutAction(form())).rejects.toThrow("lost response after commit");
    mocks.save.mockClear();
    await expect(submitExpressCheckoutAction(form())).rejects.toThrow("redirect:/m/loja-teste/pedido/existing");
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.confirm).toHaveBeenCalledTimes(1);
  });

  it("does not submit when the server total changed", async () => {
    await expect(submitExpressCheckoutAction(form("2500"))).rejects.toThrow("erro=total_updated");
    expect(mocks.confirm).not.toHaveBeenCalled();
  });

  it("requires an explicit displayed total even for a zero-total order", async () => {
    mocks.load.mockResolvedValue({ cart: { total_cents: 0 } });
    await expect(submitExpressCheckoutAction(form(""))).rejects.toThrow("erro=total_updated");
    expect(mocks.confirm).not.toHaveBeenCalled();
  });
});
