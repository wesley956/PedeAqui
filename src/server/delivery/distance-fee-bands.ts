/** Shared distance-fee price bands. No geocoding or routing is performed here.
 * Keep the server authoritative: never accept browser-supplied distance as proof.
 */
export type DistanceFeeBand = { upToKm: number; feeCents: number };

export function validateDistanceFeeBands(bands: readonly DistanceFeeBand[]): DistanceFeeBand[] {
  if (bands.length === 0) throw new Error("At least one delivery distance band is required");
  let previous = 0;
  return bands.map((band) => {
    if (!Number.isFinite(band.upToKm) || band.upToKm <= previous || band.upToKm > 9999) {
      throw new Error("Delivery distance bands must have increasing positive limits");
    }
    if (!Number.isSafeInteger(band.feeCents) || band.feeCents < 0) {
      throw new Error("Delivery distance fee must be nonnegative integer cents");
    }
    previous = band.upToKm;
    return { upToKm: band.upToKm, feeCents: band.feeCents };
  });
}

/** Selects the smallest configured band covering the routed distance.
 * Returns null when outside the configured coverage, never silently charges zero.
 */
export function quoteDistanceFee(distanceKm: number, bands: readonly DistanceFeeBand[]): number | null {
  if (!Number.isFinite(distanceKm) || distanceKm < 0) throw new Error("Invalid delivery route distance");
  const validated = validateDistanceFeeBands(bands);
  return validated.find((band) => distanceKm <= band.upToKm)?.feeCents ?? null;
}

export const exampleMotorbikeDistanceBands: readonly DistanceFeeBand[] =
  Array.from({ length: 10 }, (_, i) => ({ upToKm: i + 1, feeCents: 300 + i * 100 }));
