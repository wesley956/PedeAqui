import type { PaymentOwner, LogisticsOwner } from "@/server/integrations/core/canonical-order";
import type { IntegrationProvider } from "@/server/integrations/core/capabilities";

export type ExternalSalesProvider = Extract<IntegrationProvider, "ifood" | "99food">;
export type CanonicalExternalOrderType = "delivery" | "takeout" | "dine_in";
export type CanonicalOrderTiming = "immediate" | "scheduled";

export type CanonicalMoneyBreakdown = {
  subtotalCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  additionalFeeCents: number;
  totalCents: number;
};

export type CanonicalExternalModifier = {
  externalId: string | null;
  name: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
};

export type CanonicalExternalItem = {
  externalId: string | null;
  name: string;
  quantity: number;
  unitBasePriceCents: number;
  totalCents: number;
  notes: string | null;
  modifiers: CanonicalExternalModifier[];
};

export type CanonicalCustomerSnapshot = {
  name: string;
  phone: string | null;
};

export type CanonicalDeliveryAddressSnapshot = {
  street: string;
  number: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  complement: string | null;
  reference: string | null;
  latitude: number | null;
  longitude: number | null;
};

export type CanonicalExternalPayment = {
  method: string;
  prepaid: boolean;
  amountCents: number;
  providerStatus: string | null;
};

/**
 * Provider-neutral snapshot used to create the existing PedeAqui `orders`
 * aggregate. It contains enough operational data to keep producing/printing
 * after a provider becomes unavailable, without retaining the full raw payload.
 */
export type CanonicalExternalOrder = {
  provider: ExternalSalesProvider;
  externalMerchantId: string;
  externalOrderId: string;
  externalDisplayId: string | null;
  orderType: CanonicalExternalOrderType;
  timing: CanonicalOrderTiming;
  createdAt: string;
  scheduledFor: string | null;
  recommendedPreparationAt: string | null;
  customer: CanonicalCustomerSnapshot;
  deliveryAddress: CanonicalDeliveryAddressSnapshot | null;
  items: CanonicalExternalItem[];
  money: CanonicalMoneyBreakdown;
  payments: CanonicalExternalPayment[];
  paymentOwner: PaymentOwner;
  logisticsOwner: LogisticsOwner;
  pickupCode: string | null;
  deliveryCode: string | null;
  providerMetadata: Record<string, string | number | boolean | null>;
};

export type CanonicalExternalOrderValidation =
  | { valid: true }
  | { valid: false; errors: string[] };

function isNonNegativeInteger(value: number) {
  return Number.isSafeInteger(value) && value >= 0;
}

function validQuantity(value: number) {
  return Number.isInteger(value) && value > 0;
}

function isValidIsoInstant(value: string) {
  return value.trim().length > 0 && Number.isFinite(Date.parse(value));
}

export function validateCanonicalExternalOrder(order: CanonicalExternalOrder): CanonicalExternalOrderValidation {
  const errors: string[] = [];

  if (!order.externalMerchantId.trim()) errors.push("external_merchant_id_required");
  if (!order.externalOrderId.trim()) errors.push("external_order_id_required");
  if (!order.customer.name.trim()) errors.push("customer_name_required");
  if (!isValidIsoInstant(order.createdAt)) errors.push("created_at_invalid");
  if (order.items.length === 0) errors.push("items_required");
  if (order.timing === "scheduled" && !order.scheduledFor) errors.push("scheduled_for_required");
  if (order.scheduledFor && !isValidIsoInstant(order.scheduledFor)) errors.push("scheduled_for_invalid");
  if (order.recommendedPreparationAt && !isValidIsoInstant(order.recommendedPreparationAt)) errors.push("recommended_preparation_at_invalid");
  if (order.orderType === "delivery" && !order.deliveryAddress) errors.push("delivery_address_required");
  if (order.orderType === "delivery" && order.deliveryAddress) {
    const address = order.deliveryAddress;
    if (
      !address.street.trim()
      || !address.number?.trim()
      || !address.neighborhood?.trim()
      || !address.city?.trim()
      || !/^[A-Za-z]{2}$/.test(address.state?.trim() ?? "")
    ) {
      errors.push("delivery_address_incomplete");
    }
  }

  let itemSubtotalCents = 0;
  for (const [index, item] of order.items.entries()) {
    if (!item.name.trim()) errors.push(`item_${index}_name_required`);
    if (!validQuantity(item.quantity)) errors.push(`item_${index}_quantity_invalid`);
    if (!isNonNegativeInteger(item.unitBasePriceCents)) errors.push(`item_${index}_unit_price_invalid`);
    if (!isNonNegativeInteger(item.totalCents)) errors.push(`item_${index}_total_invalid`);

    let unitModifiersCents = 0;
    for (const [modifierIndex, modifier] of item.modifiers.entries()) {
      if (!modifier.name.trim()) errors.push(`item_${index}_modifier_${modifierIndex}_name_required`);
      if (!validQuantity(modifier.quantity)) errors.push(`item_${index}_modifier_${modifierIndex}_quantity_invalid`);
      if (!isNonNegativeInteger(modifier.unitPriceCents)) errors.push(`item_${index}_modifier_${modifierIndex}_unit_price_invalid`);
      if (!isNonNegativeInteger(modifier.totalCents)) errors.push(`item_${index}_modifier_${modifierIndex}_total_invalid`);
      if (
        isNonNegativeInteger(modifier.unitPriceCents)
        && validQuantity(modifier.quantity)
        && modifier.totalCents !== modifier.unitPriceCents * modifier.quantity
      ) {
        errors.push(`item_${index}_modifier_${modifierIndex}_total_invariant_failed`);
      }
      unitModifiersCents += modifier.totalCents;
    }

    if (
      isNonNegativeInteger(item.unitBasePriceCents)
      && validQuantity(item.quantity)
      && item.totalCents !== (item.unitBasePriceCents + unitModifiersCents) * item.quantity
    ) {
      errors.push(`item_${index}_total_invariant_failed`);
    }
    itemSubtotalCents += item.totalCents;
  }

  const moneyValues = Object.values(order.money);
  if (!moneyValues.every(isNonNegativeInteger)) errors.push("money_values_must_be_non_negative_integer_cents");

  const expectedTotal = order.money.subtotalCents
    + order.money.deliveryFeeCents
    + order.money.additionalFeeCents
    - order.money.discountCents;
  if (expectedTotal < 0 || expectedTotal !== order.money.totalCents) errors.push("order_total_invariant_failed");
  if (itemSubtotalCents !== order.money.subtotalCents) errors.push("item_subtotal_invariant_failed");

  if (!order.payments.every((payment) => isNonNegativeInteger(payment.amountCents))) {
    errors.push("payment_amount_invalid");
  }
  if (order.money.totalCents > 0 && order.payments.length === 0) {
    errors.push("payment_snapshot_required");
  }
  const paymentTotalCents = order.payments.reduce((sum, payment) => sum + payment.amountCents, 0);
  if (paymentTotalCents !== order.money.totalCents) errors.push("payment_total_invariant_failed");

  if (order.paymentOwner === "provider" && order.payments.length === 0) {
    errors.push("provider_payment_snapshot_required");
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}