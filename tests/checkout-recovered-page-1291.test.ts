import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
const mocks = vi.hoisted(() => ({ load: vi.fn(), recover: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "opaque-cart-token" }) }) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/features/orders/actions", () => ({ recoverCheckoutOrderAction: async () => {} }));
vi.mock("@/features/checkout/express-checkout-form", () => ({ ExpressCheckoutForm: () => null }));
vi.mock("@/server/growth/growth-service", () => ({ GrowthService: {} }));
vi.mock("@/server/orders/order-service", () => ({ OrderService: { recoverFromCheckout: mocks.recover } }));
vi.mock("@/server/checkout/checkout-service", () => {
  class CheckoutError extends Error { constructor(public code: string, message: string) { super(message); } }
  return { CheckoutError, CheckoutService: { load: mocks.load } };
});
import CheckoutPage from "@/app/m/[slug]/checkout/page";
import { CheckoutError } from "@/server/checkout/checkout-service";

describe("checkout refresh after order commit (#1291)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.load.mockRejectedValue(new CheckoutError("cart_empty", "Finalizado"));
    mocks.recover.mockResolvedValue({ order_id: "order-a", display_number: 203, accessToken: "secret-tracking-token" });
  });
  it("shows the persisted order number instead of another empty-cart confirmation loop", async () => {
    const view = await CheckoutPage({ params: Promise.resolve({ slug: "loja-teste" }), searchParams: Promise.resolve({}) });
    const html = renderToStaticMarkup(view);
    expect(html).toContain("Pedido #203 recebido");
    expect(html).toContain("Não é necessário enviar novamente");
    expect(html).toContain("Abrir acompanhamento");
    expect(html).not.toContain("secret-tracking-token");
    expect(mocks.recover).toHaveBeenCalledWith("loja-teste", "opaque-cart-token");
  });
  it("does not invent success when an empty cart has no existing order", async () => {
    mocks.recover.mockResolvedValue(null);
    await expect(CheckoutPage({ params: Promise.resolve({ slug: "loja-teste" }), searchParams: Promise.resolve({}) })).rejects.toThrow("Finalizado");
  });
  it("preserves unexpected load errors instead of showing a fabricated order", async () => {
    mocks.load.mockRejectedValue(new Error("database unavailable"));
    await expect(CheckoutPage({ params: Promise.resolve({ slug: "loja-teste" }), searchParams: Promise.resolve({}) })).rejects.toThrow("database unavailable");
    expect(mocks.recover).not.toHaveBeenCalled();
  });
});
