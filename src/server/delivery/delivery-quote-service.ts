import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { neighborhoodKey } from "@/server/delivery/location-key";
import { calculateDeliveryQuote, type DeliveryQuote } from "@/server/delivery/quote-calculator";

import { priceDeliveryDistanceCents } from "@/server/delivery/distance-pricing";
import { RoadDistanceUnavailable } from "@/server/delivery/geoapify-distance-provider";
import { quoteCachedRoadDistance } from "@/server/delivery/road-distance-cache";

export type { DeliveryQuote } from "@/server/delivery/quote-calculator";

type AdminClient = ReturnType<typeof createAdminClient>;

type QuoteAddress = {
  district: string;
  city: string;
  state: string;
  street?: string;
  number?: string;
  postalCode?: string | null;
};

type QuoteInput = {
  organizationId: string;
  storeId: string;
  subtotalCents: number;
  address: QuoteAddress;
  useRoadDistance?: boolean;
  admin?: AdminClient;
};

const defaults = {
  enabled: true,
  fee_mode: "neighborhood" as const,
  default_fee_cents: 0,
  free_delivery_over_cents: null as number | null,
  estimated_min_minutes: 30,
  estimated_max_minutes: 60,
  require_neighborhood_match: true,
};

export class DeliveryQuoteService {
  static usesRoadDistance(storeId: string) {
    return process.env.GEOAPIFY_PILOT_STORE_ID === storeId;
  }

  static async quote(input: QuoteInput): Promise<DeliveryQuote> {
    if (!Number.isSafeInteger(input.subtotalCents) || input.subtotalCents < 0) {
      throw new Error("Invalid delivery quote subtotal");
    }
    const admin = input.admin ?? createAdminClient();
    const [settingsResult, neighborhoodResult] = await Promise.all([
      admin.from("store_delivery_settings")
        .select("enabled, fee_mode, default_fee_cents, free_delivery_over_cents, estimated_min_minutes, estimated_max_minutes, require_neighborhood_match")
        .eq("organization_id", input.organizationId)
        .eq("store_id", input.storeId)
        .maybeSingle(),
      admin.from("delivery_neighborhoods")
        .select("fee_cents, minimum_order_cents, additional_minutes")
        .eq("organization_id", input.organizationId)
        .eq("store_id", input.storeId)
        .eq("neighborhood_key", neighborhoodKey(input.address.district, input.address.city, input.address.state.toUpperCase()))
        .eq("active", true)
        .is("deleted_at", null)
        .maybeSingle(),
    ]);
    const { data: settingsRow, error: settingsError } = settingsResult;
    if (settingsError) throw settingsError;
    const settings = settingsRow ?? defaults;
    const { data: neighborhood, error: neighborhoodError } = neighborhoodResult;
    if (neighborhoodError) throw neighborhoodError;
    const quote = calculateDeliveryQuote({ subtotalCents: input.subtotalCents, settings, neighborhood });
    if (!quote.serviceable || !input.useRoadDistance || !this.usesRoadDistance(input.storeId)) return quote;

    const { street, number } = input.address;
    const latitude = process.env.GEOAPIFY_PILOT_ORIGIN_LATITUDE?.trim();
    const longitude = process.env.GEOAPIFY_PILOT_ORIGIN_LONGITUDE?.trim();
    if (!street || !number || !latitude || !longitude ||
      !Number.isFinite(Number(latitude)) || Math.abs(Number(latitude)) > 90 ||
      !Number.isFinite(Number(longitude)) || Math.abs(Number(longitude)) > 180) {
      return { serviceable: false, reason: "route_unavailable" };
    }

    try {
      const meters = await quoteCachedRoadDistance({
        origin: { latitude: Number(latitude), longitude: Number(longitude) },
        destination: { ...input.address, street, number },
      }, { admin, storeId: input.storeId, apiKey: process.env.GEOAPIFY_API_KEY ?? "" });
      const feeCents = settings.free_delivery_over_cents !== null &&
        input.subtotalCents >= settings.free_delivery_over_cents ? 0 : priceDeliveryDistanceCents(meters);
      return { ...quote, feeCents };
    } catch (error) {
      if (!(error instanceof RoadDistanceUnavailable)) throw error;
      if ((error.temporary || error.message === "address_unverified") &&
        process.env.GEOAPIFY_PILOT_NEIGHBORHOOD_FALLBACK === "true" &&
        settings.fee_mode === "neighborhood" && neighborhood) {
        return quote;
      }
      return { serviceable: false, reason: "route_unavailable" };
    }
  }
}
