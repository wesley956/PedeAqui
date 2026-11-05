import "server-only";

/**
 * Staged provider adapter. Deliberately NOT connected to checkout until
 * durable quota control, persistent cache, address validation and price
 * reconciliation are implemented and homologated.
 *
 * API key must remain server-side. Never put it in NEXT_PUBLIC_*.
 */
export type RoadDistanceInput = {
  origin: { latitude: number; longitude: number };
  destination: { street: string; number: string; district: string; city: string; state: string; postalCode?: string | null };
};

export class RoadDistanceUnavailable extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "RoadDistanceUnavailable";
  }
}

type Fetcher = typeof fetch;
type GeoFeature = {
  properties?: {
    lat?: unknown;
    lon?: unknown;
    city?: unknown;
    state_code?: unknown;
    country_code?: unknown;
    street?: unknown;
    housenumber?: unknown;
    result_type?: unknown;
    rank?: { confidence?: unknown };
  };
};

function normalizeAddressPart(value: unknown) {
  return typeof value === "string"
    ? value.normalize("NFD").replace(/\p{M}/gu, "").trim().replace(/\s+/g, " ").toLowerCase()
    : "";
}
function validCoordinate(lat: number, lon: number) {
  return Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

export async function queryGeoapifyRoadMeters(
  input: RoadDistanceInput,
  options: { apiKey: string; fetcher?: Fetcher; timeoutMs?: number },
): Promise<number> {
  if (!options.apiKey || !validCoordinate(input.origin.latitude, input.origin.longitude)) {
    throw new RoadDistanceUnavailable("provider_not_configured");
  }
  const d = input.destination;
  if (!d.street.trim() || !d.number.trim() || !d.city.trim() || !/^[A-Za-z]{2}$/.test(d.state)) {
    throw new RoadDistanceUnavailable("destination_incomplete");
  }
  const fetcher = options.fetcher ?? fetch;
  const timeout = Math.max(500, Math.min(options.timeoutMs ?? 2500, 5000));
  const address = [d.street.trim() + ", " + d.number.trim(), d.district, d.city, d.state, d.postalCode, "Brasil"].filter(Boolean).join(", ");
  const geocode = new URL("https://api.geoapify.com/v1/geocode/search");
  geocode.searchParams.set("text", address);
  geocode.searchParams.set("filter", "countrycode:br");
  geocode.searchParams.set("limit", "1");
  geocode.searchParams.set("apiKey", options.apiKey);
  try {
    const geoResponse = await fetcher(geocode, { signal: AbortSignal.timeout(timeout), cache: "no-store" });
    if (!geoResponse.ok) throw new RoadDistanceUnavailable("geocoding_http_error");
    const geo = await geoResponse.json() as { features?: GeoFeature[] };
    const p = geo.features?.[0]?.properties;
    const { lat, lon, rank } = p ?? {};
    const confidence = rank?.confidence;
    if (
      typeof lat !== "number" || typeof lon !== "number" || !validCoordinate(lat, lon) ||
      typeof confidence !== "number" || !Number.isFinite(confidence) || confidence < 0.8 || confidence > 1 ||
      p?.country_code !== "br" || p.result_type !== "building" ||
      normalizeAddressPart(p.state_code) !== normalizeAddressPart(d.state) ||
      normalizeAddressPart(p.city) !== normalizeAddressPart(d.city) ||
      normalizeAddressPart(p.street) !== normalizeAddressPart(d.street) ||
      normalizeAddressPart(p.housenumber) !== normalizeAddressPart(d.number)
    ) {
      throw new RoadDistanceUnavailable("address_unverified");
    }
    const route = new URL("https://api.geoapify.com/v1/routing");
    route.searchParams.set("waypoints", `${input.origin.latitude},${input.origin.longitude}|${lat},${lon}`);
    route.searchParams.set("mode", "drive");
    route.searchParams.set("format", "json");
    route.searchParams.set("units", "metric");
    route.searchParams.set("apiKey", options.apiKey);
    const routeResponse = await fetcher(route, { signal: AbortSignal.timeout(timeout), cache: "no-store" });
    if (!routeResponse.ok) throw new RoadDistanceUnavailable("routing_http_error");
    const body = await routeResponse.json() as { results?: Array<{ distance?: unknown }> };
    const meters = body.results?.[0]?.distance;
    if (typeof meters !== "number" || !Number.isFinite(meters) || meters <= 0 || meters > 30_000) {
      throw new RoadDistanceUnavailable("route_invalid_or_out_of_range");
    }
    return meters;
  } catch (error) {
    if (error instanceof RoadDistanceUnavailable) throw error;
    throw new RoadDistanceUnavailable("provider_timeout_or_network_error");
  }
}
