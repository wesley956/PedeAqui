/**
 * Provisional delivery-by-road pricing. Pure and independent from the map provider.
 * The interval is (previous kilometer, current kilometer], with 0–1 km = R$4.
 */
export function priceDeliveryDistanceCents(distanceMeters: number, options: {
  firstKmCents?: number;
  additionalKmCents?: number;
  maxDistanceMeters?: number;
} = {}): number {
  const { firstKmCents = 400, additionalKmCents = 100, maxDistanceMeters = 30_000 } = options;
  if (!Number.isFinite(distanceMeters) || distanceMeters < 0 || distanceMeters > maxDistanceMeters) {
    throw new Error("delivery_distance_invalid_or_out_of_range");
  }
  if (![firstKmCents, additionalKmCents].every((value) => Number.isSafeInteger(value) && value >= 0)) {
    throw new Error("delivery_distance_price_invalid");
  }
  const kilometersCharged = Math.max(1, Math.ceil(distanceMeters / 1000));
  const cents = firstKmCents + (kilometersCharged - 1) * additionalKmCents;
  if (!Number.isSafeInteger(cents)) throw new Error("delivery_distance_price_overflow");
  return cents;
}
