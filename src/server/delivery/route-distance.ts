/** Normalizes a road-route distance obtained by the server from a trusted routing provider.
 * Do not call this with client-provided distances; routing integration must be server-side.
 */
export type RoadRouteResult = {
  distanceMeters: number;
  provider: string;
};

export function roadRouteKilometers(result: RoadRouteResult): number {
  if (!result || typeof result.provider !== "string" || !result.provider.trim()) {
    throw new Error("Delivery route provider missing");
  }
  if (!Number.isSafeInteger(result.distanceMeters) || result.distanceMeters < 0) {
    throw new Error("Invalid road-route distance in meters");
  }
  return result.distanceMeters / 1000;
}
