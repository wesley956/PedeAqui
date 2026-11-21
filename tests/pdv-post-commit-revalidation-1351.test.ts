import { describe, expect, it, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  createSale: vi.fn(),
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/server/pdv/pdv-service", () => ({ PdvService: { createSale: mocks.createSale } }));

import { createPdvSaleAction } from "@/features/pdv/actions";
import type { PosSaleInput } from "@/server/pdv/schemas";

const input = {
  fulfillmentType: "counter",
  items: [{ productId: "00000000-0000-4000-8000-000000000001", quantity: 1, note: "", modifierIds: [] }],
  payments: [{ method: "pix", amountCents: 1590 }],
  customer: null,
  growth: { couponCode: null, cashbackRedeemCents: 0, loyaltyRedeemPoints: 0 },
} satisfies PosSaleInput;
const sale = { orderId: "00000000-0000-4000-8000-000000000003", displayNumber: 7, totalCents: 1590, changeDueCents: 0, created: true };

describe("PDV committed sale confirmation", () => {
  beforeEach(() => {
    mocks.createSale.mockReset();
    mocks.revalidatePath.mockReset();
  });
  it("returns success when cache revalidation throws after commit", async () => {
    mocks.createSale.mockResolvedValue(sale);
    mocks.revalidatePath.mockImplementationOnce(() => { throw new Error("cache unavailable"); });
    const result = await createPdvSaleAction(input, "stable-idempotency");
    expect(result).toMatchObject({ ok: true, sale });
    expect(mocks.createSale).toHaveBeenCalledTimes(1);
    expect(mocks.revalidatePath).toHaveBeenCalledTimes(5);
  });
  it("returns failure when the sale itself was not committed", async () => {
    mocks.createSale.mockRejectedValue(new Error("payment method disabled"));
    const result = await createPdvSaleAction(input, "stable-idempotency");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("forma de pagamento");
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
