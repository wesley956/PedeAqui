import type { ProductPromotion } from "./promotion-service";

// The caller supplies the schedules available to its projection and resolves
// their active windows in the store timezone. Never display a surcharge as a sale.
export function effectivePromotionalPrice(input: {
  priceCents: number;
  legacyPromotionalPriceCents: number | null;
  hasSchedule: boolean;
  promotion: Pick<ProductPromotion, "promotional_price_cents"> | null;
}) {
  const candidate = input.hasSchedule
    ? input.promotion?.promotional_price_cents ?? null
    : input.legacyPromotionalPriceCents;
  return candidate !== null && Number.isInteger(candidate) && candidate >= 0 && candidate < input.priceCents
    ? candidate : null;
}
