import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ set: vi.fn(), apply: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "cart-token" }), set: mocks.set }) }));
vi.mock("next/navigation", () => ({ redirect: (url: string) => { throw new Error(url); } }));
vi.mock("@/server/cart/cart-service", () => ({ CartService: { getCart: async () => ({ cart: { id: "cart" }, store: { organization_id: "org", id: "store" } }) } }));
vi.mock("@/server/modules/store-module-state-service", () => ({ StoreModuleStateService: { isEnabled: async () => true } }));
vi.mock("@/server/growth/growth-service", () => ({ GrowthService: { applyCartBenefits: mocks.apply, clearCartBenefits: vi.fn() } }));

import { applyCheckoutBenefitsAction } from "@/features/checkout/benefit-actions";

describe("checkout coupon draft", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.apply.mockReset(); });
  const form = () => {
    const data = new FormData();
    data.set("storeSlug", "dona-maria");
    data.set("couponCode", " INVALIDO ");
    return data;
  };
  it("retains failed input without recording an applied benefit", async () => {
    mocks.apply.mockRejectedValueOnce(new Error("invalid"));
    await expect(applyCheckoutBenefitsAction(form())).rejects.toThrow("benefit_invalid");
    expect(mocks.set).toHaveBeenCalledTimes(1);
    expect(mocks.set).toHaveBeenCalledWith("pedeaqui_coupon_draft_dona-maria", "INVALIDO", expect.objectContaining({ httpOnly: true, sameSite: "lax", path: "/m/dona-maria", maxAge: 1800 }));
    expect(mocks.apply).toHaveBeenCalledWith("dona-maria", "cart-token", { couponCode: "INVALIDO", cashbackRedeemCents: 0, loyaltyRedeemPoints: 0 });
  });
  it("expires the draft after successful application", async () => {
    mocks.apply.mockResolvedValueOnce(undefined);
    await expect(applyCheckoutBenefitsAction(form())).rejects.toThrow("/m/dona-maria/checkout");
    expect(mocks.set).toHaveBeenLastCalledWith("pedeaqui_coupon_draft_dona-maria", "", { path: "/m/dona-maria", maxAge: 0 });
  });
});
