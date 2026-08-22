import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { neighborhoodKey } from "@/server/delivery/location-key";
import { calculateDeliveryQuote, type DeliveryQuote } from "@/server/delivery/quote-calculator";

export type { DeliveryQuote } from "@/server/delivery/quote-calculator";

type AdminClient = ReturnType<typeof createAdminClient>;

type QuoteAddress = {
  district: string;
  city: string;
  state: string;
};

type QuoteInput = {
  organizationId: string;
  storeId: string;
  subtotalCents: number;
  address: QuoteAddress;
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
    return calculateDeliveryQuote({ subtotalCents: input.subtotalCents, settings, neighborhood });
  }
}
