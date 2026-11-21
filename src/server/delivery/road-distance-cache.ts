import "server-only";

import { createHmac } from "node:crypto";
import type { createAdminClient } from "@/lib/supabase/admin";
import { queryGeoapifyRoadMeters, RoadDistanceUnavailable, type RoadDistanceInput } from "@/server/delivery/geoapify-distance-provider";

const cacheTtlMs = 24 * 60 * 60 * 1000;

export async function quoteCachedRoadDistance(input: RoadDistanceInput, options: {
  admin: ReturnType<typeof createAdminClient>;
  storeId: string;
  apiKey: string;
}): Promise<number> {
  if (!options.apiKey) throw new RoadDistanceUnavailable("provider_not_configured");
  const { street, number, district, city, state, postalCode } = input.destination;
  const address = [street, number, district, city, state, postalCode ?? ""]
    .map((part) => part.normalize("NFC").trim().replace(/\s+/g, " ").toLowerCase());
  const cacheKey = createHmac("sha256", options.apiKey)
    .update(JSON.stringify([options.storeId, input.origin.latitude, input.origin.longitude, address]))
    .digest("hex");

  const { data: cached, error: readError } = await options.admin.from("delivery_road_distance_cache")
    .select("distance_meters")
    .eq("store_id", options.storeId)
    .eq("cache_key", cacheKey)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (readError) throw new RoadDistanceUnavailable("route_cache_unavailable");
  if (cached) return Number(cached.distance_meters);

  const { data: reserved, error: quotaError } = await options.admin.rpc("reserve_delivery_route_quote");
  if (quotaError || reserved !== true) throw new RoadDistanceUnavailable("route_quota_unavailable");

  const distance = await queryGeoapifyRoadMeters(input, { apiKey: options.apiKey });
  const { error: writeError } = await options.admin.from("delivery_road_distance_cache").upsert({
    store_id: options.storeId,
    cache_key: cacheKey,
    distance_meters: distance,
    expires_at: new Date(Date.now() + cacheTtlMs).toISOString(),
  }, { onConflict: "store_id,cache_key" });
  if (writeError) throw new RoadDistanceUnavailable("route_cache_unavailable");
  return distance;
}
