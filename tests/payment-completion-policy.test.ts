import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isDeliveredWithPaymentPending, isFlexiblePaymentQueue } from "@/modules/payment-completion-policy";

describe("payment completion policies", () => {
  it("only removes delivered debt from the operation in flexible mode", () => {
    const pending = { order_status: "confirmed", fulfillment_status: "delivered", payment_status: "pending" };
    expect(isFlexiblePaymentQueue("flexible") && isDeliveredWithPaymentPending(pending)).toBe(true);
    expect(isFlexiblePaymentQueue("strict")).toBe(false);
    expect(isDeliveredWithPaymentPending({ ...pending, payment_status: "paid" })).toBe(false);
  });

  it("keeps legacy stores unchanged and requires explicit quick confirmation", () => {
    const service = readFileSync("src/server/delivery/manual-delivery-service.ts", "utf8");
    expect(service).toContain("order.paymentCompletionPolicy == null");
    expect(service).toContain('order.paymentCompletionPolicy === "quick_confirmation" && paymentReceived');
    expect(service).not.toContain('order.paymentCompletionPolicy === "flexible" && paymentReceived');
  });

  it("keeps delivery and payment as separate authoritative events", () => {
    const actions = readFileSync("src/features/orders/actions.ts", "utf8");
    expect(actions).toContain("ManualDeliveryService.finish");
    expect(actions).toContain("PaymentService.confirmDefaultForOrder");
    expect(actions).toContain("OrderService.complete");
    expect(actions).toContain("paymentReceived");
  });

  it("offers all policies in the guided setup and a separate financial queue", () => {
    const setup = readFileSync("src/features/operations/guided-setup-form.tsx", "utf8");
    const finance = readFileSync("src/app/(app)/financeiro/page.tsx", "utf8");
    for (const policy of ["strict", "flexible", "quick_confirmation"]) expect(setup).toContain(`value="${policy}"`);
    expect(finance).toContain("Entregas com pagamento pendente");
    expect(finance).toContain('intent="mark_paid_and_complete"');
  });
});
