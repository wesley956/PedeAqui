import "server-only";

// The Geoapify credential is used only on the server.
export type RoadDistanceInput = {
  origin: { latitude: number; longitude: number };
  destination: { street: string; number: string; district: string; city: string; state: string; postalCode?: string | null };
};

export class RoadDistanceUnavailable extends Error {
  constructor(reason: string, readonly temporary = false) {
    super(reason);
    this.name = "RoadDistanceUnavailable";
  }
}

type Fetcher = typeof fetch;
type GeoAddress = {
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

function normalizeAddressPart(value: unknown) {
  return typeof value === "string"
    ? value.normalize("NFD").replace(/\p{M}/gu, "").trim().replace(/\s+/g, " ").toLowerCase()
    : "";
}
const stateNames: Record<string, string> = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia",
  CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás",
  MA: "Maranhão", MT: "Mato Grosso", MS: "Mato Grosso do Sul", MG: "Minas Gerais",
  PA: "Pará", PB: "Paraíba", PR: "Paraná", PE: "Pernambuco", PI: "Piauí",
  RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RS: "Rio Grande do Sul",
  RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina", SP: "São Paulo",
  SE: "Sergipe", TO: "Tocantins",
};

function expandStreetPrefix(street: string) {
  return street.trim().replace(/^r\.\s+/i, "Rua ").replace(/^av\.\s+/i, "Avenida ");
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
  const state = stateNames[d.state.toUpperCase()];
  const street = expandStreetPrefix(d.street);
  if (!street || !d.number.trim() || !d.city.trim() || !state) {
    throw new RoadDistanceUnavailable("destination_incomplete");
  }
  const fetcher = options.fetcher ?? fetch;
  const geocodingTimeout = Math.max(500, Math.min(options.timeoutMs ?? 7000, 7000));
  const routingTimeout = Math.max(500, Math.min(options.timeoutMs ?? 2500, 5000));
  const geocode = new URL("https://api.geoapify.com/v1/geocode/search");
  geocode.search = new URLSearchParams({
    street,
    housenumber: d.number.trim(),
    city: d.city.trim(),
    state,
    country: "Brasil",
    filter: "countrycode:br",
    limit: "3",
    format: "json",
    apiKey: options.apiKey,
  }).toString();
  if (d.postalCode?.trim()) geocode.searchParams.set("postcode", d.postalCode.trim());
  try {
    const geoResponse = await fetcher(geocode, { signal: AbortSignal.timeout(geocodingTimeout), cache: "no-store" });
    if (!geoResponse.ok) throw new RoadDistanceUnavailable("geocoding_http_error", geoResponse.status === 429 || geoResponse.status >= 500);
    const geo = await geoResponse.json() as { results?: GeoAddress[] };
    const point = geo.results?.find((p): p is GeoAddress & { lat: number; lon: number } => {
      const { lat, lon, rank } = p;
      const confidence = rank?.confidence;
      return typeof lat === "number" && typeof lon === "number" && validCoordinate(lat, lon) &&
        typeof confidence === "number" && confidence >= 0.8 && confidence <= 1 &&
        p.country_code === "br" && (p.result_type === "building" || p.result_type === "amenity") &&
        normalizeAddressPart(p.state_code) === normalizeAddressPart(d.state) &&
        normalizeAddressPart(p.city) === normalizeAddressPart(d.city) &&
        normalizeAddressPart(expandStreetPrefix(typeof p.street === "string" ? p.street : "")) === normalizeAddressPart(street) &&
        normalizeAddressPart(p.housenumber) === normalizeAddressPart(d.number);
    });
    if (!point) throw new RoadDistanceUnavailable("address_unverified");
    const route = new URL("https://api.geoapify.com/v1/routing");
    route.searchParams.set("waypoints", `${input.origin.latitude},${input.origin.longitude}|${point.lat},${point.lon}`);
    route.searchParams.set("mode", "drive");
    route.searchParams.set("format", "json");
    route.searchParams.set("units", "metric");
    route.searchParams.set("apiKey", options.apiKey);
    const routeResponse = await fetcher(route, { signal: AbortSignal.timeout(routingTimeout), cache: "no-store" });
    if (!routeResponse.ok) throw new RoadDistanceUnavailable("routing_http_error", routeResponse.status === 429 || routeResponse.status >= 500);
    const body = await routeResponse.json() as { results?: Array<{ distance?: unknown }> };
    const meters = body.results?.[0]?.distance;
    if (typeof meters !== "number" || !Number.isFinite(meters) || meters <= 0 || meters > 30_000) {
      throw new RoadDistanceUnavailable("route_invalid_or_out_of_range");
    }
    return meters;
  } catch (error) {
    if (error instanceof RoadDistanceUnavailable) throw error;
    throw new RoadDistanceUnavailable("provider_timeout_or_network_error", true);
  }
}
