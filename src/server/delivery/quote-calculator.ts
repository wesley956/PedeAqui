export type DeliveryQuote =
  | { serviceable: false; reason: "delivery_disabled" | "neighborhood_not_served" }
  | { serviceable: false; reason: "minimum_order"; minimumOrderCents: number }
  | { serviceable: true; feeCents: number; estimatedMinMinutes: number; estimatedMaxMinutes: number };

export type DeliveryQuoteSettings = {
  enabled: boolean;
  fee_mode: "default" | "neighborhood";
  default_fee_cents: number;
  free_delivery_over_cents: number | null;
  estimated_min_minutes: number;
  estimated_max_minutes: number;
  require_neighborhood_match: boolean;
};

export type DeliveryQuoteNeighborhood = {
  fee_cents: number;
  minimum_order_cents: number | null;
  additional_minutes: number;
} | null;

function safeNonnegativeInteger(value: unknown, field: string) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid delivery ${field}`);
  return parsed;
}

export function calculateDeliveryQuote(input: {
  subtotalCents: number;
  settings: DeliveryQuoteSettings;
  neighborhood: DeliveryQuoteNeighborhood;
}): DeliveryQuote {
  const { settings, neighborhood } = input;
  const subtotalCents = safeNonnegativeInteger(input.subtotalCents, "quote subtotal");
  if (!settings.enabled) return { serviceable: false, reason: "delivery_disabled" };
  if (!neighborhood && settings.require_neighborhood_match) {
    return { serviceable: false, reason: "neighborhood_not_served" };
  }

  const minimumOrderCents = safeNonnegativeInteger(neighborhood?.minimum_order_cents ?? 0, "minimum order");
  if (subtotalCents < minimumOrderCents) {
    return { serviceable: false, reason: "minimum_order", minimumOrderCents };
  }

  const defaultFeeCents = safeNonnegativeInteger(settings.default_fee_cents, "default fee");
  const rawFeeCents = settings.fee_mode === "neighborhood"
    ? safeNonnegativeInteger(neighborhood?.fee_cents ?? defaultFeeCents, "neighborhood fee")
    : defaultFeeCents;
  const freeThreshold = settings.free_delivery_over_cents === null
    ? null
    : safeNonnegativeInteger(settings.free_delivery_over_cents, "free threshold");
  const feeCents = freeThreshold !== null && subtotalCents >= freeThreshold ? 0 : rawFeeCents;
  const estimatedMinMinutes = safeNonnegativeInteger(settings.estimated_min_minutes, "minimum estimate");
  const estimatedMaxMinutes = safeNonnegativeInteger(settings.estimated_max_minutes, "maximum estimate");
  const extraMinutes = safeNonnegativeInteger(neighborhood?.additional_minutes ?? 0, "additional estimate");
  if (estimatedMinMinutes > estimatedMaxMinutes) throw new Error("Invalid delivery estimate range");

  return {
    serviceable: true,
    feeCents,
    estimatedMinMinutes: estimatedMinMinutes + extraMinutes,
    estimatedMaxMinutes: estimatedMaxMinutes + extraMinutes,
  };
}
