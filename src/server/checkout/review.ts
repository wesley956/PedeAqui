import type { FulfillmentType, PaymentMethod } from "@/server/checkout/schemas";

export type CheckoutReviewInput = {
  cartItemStatuses: ReadonlyArray<"valid" | "unavailable" | "invalid_modifiers">;
  subtotalCents: number;
  totalCents: number;
  minimumOrderCents: number;
  canOrder: boolean;
  identityComplete: boolean;
  fulfillmentType: FulfillmentType | null;
  deliveryQuoteStatus: "not_required" | "required" | "valid" | "unserviceable";
  paymentMethod: PaymentMethod | null;
  enabledPaymentMethods: ReadonlyArray<PaymentMethod>;
  cashChangeForCents: number | null;
  scheduledFor: string | null;
  now?: Date;
};

export type CheckoutBlockerCode =
  | "empty_or_invalid_cart"
  | "minimum_order"
  | "store_unavailable"
  | "identity_missing"
  | "fulfillment_missing"
  | "delivery_not_ready"
  | "payment_missing"
  | "payment_unavailable"
  | "invalid_change"
  | "schedule_invalid";

export type CheckoutBlocker = { code: CheckoutBlockerCode; message: string };

export function reviewCheckout(input: CheckoutReviewInput) {
  const blockers: CheckoutBlocker[] = [];
  if (input.cartItemStatuses.length === 0 || input.cartItemStatuses.some((status) => status !== "valid")) {
    blockers.push({ code: "empty_or_invalid_cart", message: "Revise os itens inválidos do carrinho." });
  }
  if (input.subtotalCents < input.minimumOrderCents) {
    blockers.push({ code: "minimum_order", message: "O pedido ainda não atingiu o valor mínimo da loja." });
  }
  if (!input.canOrder) blockers.push({ code: "store_unavailable", message: "A loja não está aceitando pedidos neste momento." });
  if (!input.identityComplete) blockers.push({ code: "identity_missing", message: "Informe nome e telefone para continuar." });
  if (!input.fulfillmentType) blockers.push({ code: "fulfillment_missing", message: "Escolha entrega ou retirada." });
  if (input.fulfillmentType === "delivery" && input.deliveryQuoteStatus !== "valid") {
    blockers.push({ code: "delivery_not_ready", message: "Informe um endereço atendido e valide a entrega." });
  }
  if (!input.paymentMethod) blockers.push({ code: "payment_missing", message: "Escolha uma forma de pagamento." });
  else if (!input.enabledPaymentMethods.includes(input.paymentMethod)) {
    blockers.push({ code: "payment_unavailable", message: "A forma de pagamento selecionada não está mais disponível." });
  }
  if (input.paymentMethod === "cash" && input.cashChangeForCents !== null && input.cashChangeForCents < input.totalCents) {
    blockers.push({ code: "invalid_change", message: "O valor para troco deve ser igual ou maior que o total do pedido." });
  }
  if (input.scheduledFor) {
    const scheduledAt = new Date(input.scheduledFor).getTime();
    const now = (input.now ?? new Date()).getTime();
    // Saving requires 15 minutes. Review allows five minutes of elapsed time
    // so a customer is not invalidated while finishing the last checkout step.
    if (!Number.isFinite(scheduledAt) || scheduledAt < now + 10 * 60_000) {
      blockers.push({ code: "schedule_invalid", message: "Escolha novamente o horário agendado." });
    }
  }
  return { ready: blockers.length === 0, blockers };
}
