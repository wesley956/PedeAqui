import { describe, expect, it, vi } from "vitest";
import { paymentPayload, remainingPaymentCents, projectedCashDifferenceCents, type PaymentDraft } from "@/features/pdv/payment-draft";
import { friendlyPdvError } from "@/features/pdv/errors";
import { posSaleSchema } from "@/server/pdv/schemas";

const rpc = vi.hoisted(() => vi.fn(async () => ({ data: { order_id: "00000000-0000-4000-8000-000000000003", display_number: 1, total_cents: 1590, change_due_cents: 0, created: true }, error: null })));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));
vi.mock("@/server/access/authorize", () => ({ authorize: async () => ({ organizationId: "org", storeId: "store", userId: "actor" }), AuthorizationError: Error }));
vi.mock("@/server/payments/store-payment-method-service", () => ({ StorePaymentMethodService: {} }));
import { PdvService } from "@/server/pdv/pdv-service";
const draft = (patch: Partial<PaymentDraft> = {}): PaymentDraft => ({ id: "one", method: "pix", amountText: "", cashReceivedText: "", reference: "", ...patch });
const item = { productId: "00000000-0000-4000-8000-000000000001", quantity: 1, note: "TESTE QA", modifierIds: [] };

describe("PDV payment and fulfillment regressions", () => {
  for (const fulfillmentType of ["counter", "pickup"] as const) {
    for (const method of ["cash", "pix", "credit_card", "debit_card"] as const) {
      it(`sends ${method} with ${fulfillmentType} without losing the modality`, async () => {
        const payment = paymentPayload([draft({ method })], 1590);
        expect(payment.ok).toBe(true);
        if (!payment.ok) throw new Error(payment.error);
        await PdvService.createSale(posSaleSchema.parse({ fulfillmentType, items: [item], payments: payment.value }), `test-${method}-${fulfillmentType}`);
        expect(rpc).toHaveBeenLastCalledWith("pdv_create_order_growth_internal", expect.objectContaining({ p_store_id: "store", p_actor_user_id: "actor", p_growth: expect.objectContaining({ fulfillment_type: fulfillmentType }), p_payments: [expect.objectContaining({ method, amount_cents: 1590 })] }));
      });
    }
  }
  it("keeps legacy clients on local service and rejects delivery/table in POS", () => {
    const input = { items: [item], payments: [{ method: "pix", amountCents: 1590 }] };
    expect(posSaleSchema.parse(input).fulfillmentType).toBe("counter");
    expect(posSaleSchema.safeParse({ ...input, fulfillmentType: "delivery" }).success).toBe(false);
    expect(posSaleSchema.safeParse({ ...input, fulfillmentType: "table" }).success).toBe(false);
  });
  it("validates cash received and excludes cash values from card payments", () => {
    expect(paymentPayload([draft({ method: "cash", cashReceivedText: "10,00" })], 1590).ok).toBe(false);
    const result = paymentPayload([draft({ method: "credit_card", cashReceivedText: "20,00" })], 1590);
    expect(result).toMatchObject({ ok: true, value: [{ cashReceivedCents: null }] });
  });
  it("requires split payments to close the total and calculates the remainder", () => {
    const payments = [draft({ method: "cash", amountText: "10,00", cashReceivedText: "20,00" }), draft({ id: "two", amountText: "5,90" })];
    expect(paymentPayload(payments, 1590).ok).toBe(true);
    expect(remainingPaymentCents(payments.slice(0, 1), 1590)).toBe(590);
    expect(paymentPayload([payments[0]!, draft({ id: "two" })], 1590).ok).toBe(false);
    expect(paymentPayload(payments, 2000).ok).toBe(false);
  });
  it("explains PostgREST object errors without exposing raw database messages", () => {
    expect(friendlyPdvError({ message: "open cash session required for cash payment", code: "P0001" })).toBe("Abra o caixa antes de finalizar uma venda em dinheiro.");
    expect(friendlyPdvError({ message: "cash received is below payment amount" })).toContain("menor");
    expect(friendlyPdvError({ message: "private unexpected internals" })).not.toContain("private");
  });
});

describe("cash change while typing", () => {
  it("uses the current sale total when a single cash amount is automatic", () => {
    const cash = draft({ method: "cash", cashReceivedText: "20,00" });
    expect(projectedCashDifferenceCents(cash, 1590, 1)).toBe(410);
    expect(projectedCashDifferenceCents(cash, 1990, 1)).toBe(10);
  });
  it("uses only the cash portion in a split payment", () => {
    expect(projectedCashDifferenceCents(draft({ method: "cash", amountText: "10,00", cashReceivedText: "20,00" }), 1590, 2)).toBe(1000);
  });
  it("shows zero for exact cash and the shortfall for insufficient cash", () => {
    expect(projectedCashDifferenceCents(draft({ method: "cash", cashReceivedText: "15,90" }), 1590, 1)).toBe(0);
    expect(projectedCashDifferenceCents(draft({ method: "cash", cashReceivedText: "10,00" }), 1590, 1)).toBe(-590);
  });
  it("does not guess change for incomplete values or an unspecified split amount", () => {
    expect(projectedCashDifferenceCents(draft({ method: "cash" }), 1590, 1)).toBeNull();
    expect(projectedCashDifferenceCents(draft({ method: "cash", cashReceivedText: "20,000" }), 1590, 1)).toBeNull();
    expect(projectedCashDifferenceCents(draft({ method: "cash", cashReceivedText: "20,00" }), 1590, 2)).toBeNull();
    expect(projectedCashDifferenceCents(draft({ cashReceivedText: "20,00" }), 1590, 1)).toBeNull();
  });
  it("does not invent change for a fully discounted sale", () => {
    expect(projectedCashDifferenceCents(draft({ method: "cash", cashReceivedText: "20,00" }), 0, 1)).toBe(0);
  });
});
