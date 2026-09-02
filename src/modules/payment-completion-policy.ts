export const PAYMENT_COMPLETION_POLICIES = ["strict", "flexible", "quick_confirmation"] as const;
export type PaymentCompletionPolicy = typeof PAYMENT_COMPLETION_POLICIES[number];

export function isFlexiblePaymentQueue(policy: PaymentCompletionPolicy | null | undefined) {
  return policy === "flexible";
}

export function isDeliveredWithPaymentPending(order: { order_status: string; fulfillment_status: string; payment_status: string }) {
  return order.order_status === "confirmed" && order.fulfillment_status === "delivered" && !["paid", "partially_refunded", "refunded"].includes(order.payment_status);
}
