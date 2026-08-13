import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { neighborhoodKey } from "@/server/delivery/location-key";

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

export type DeliveryQuote =
  | { serviceable: false; reason: "delivery_disabled" | "neighborhood_not_served" }
  | { serviceable: false; reason: "minimum_order"; minimumOrderCents: number }
  | { serviceable: true; feeCents: number; estimatedMinMinutes: number; estimatedMaxMinutes: number };

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
    const { data: settingsRow, error: settingsError } = await admin.from("store_delivery_settings")
      .select("enabled, fee_mode, default_fee_cents, free_delivery_over_cents, estimated_min_minutes, estimated_max_minutes, require_neighborhood_match")
      .eq("organization_id", input.organizationId)
      .eq("store_id", input.storeId)
      .maybeSingle();
    if (settingsError) throw settingsError;
    const settings = settingsRow ?? defaults;
    if (!settings.enabled) return { serviceable: false, reason: "delivery_disabled" };

    const { data: neighborhood, error: neighborhoodError } = await admin.from("delivery_neighborhoods")
      .select("fee_cents, minimum_order_cents, additional_minutes")
      .eq("organization_id", input.organizationId)
      .eq("store_id", input.storeId)
      .eq("neighborhood_key", neighborhoodKey(input.address.district, input.address.city, input.address.state.toUpperCase()))
      .eq("active", true)
      .is("deleted_at", null)
      .maybeSingle();
    if (neighborhoodError) throw neighborhoodError;
    if (!neighborhood && settings.require_neighborhood_match) {
      return { serviceable: false, reason: "neighborhood_not_served" };
    }

    const minimumOrderCents = Number(neighborhood?.minimum_order_cents ?? 0);
    if (input.subtotalCents < minimumOrderCents) {
      return { serviceable: false, reason: "minimum_order", minimumOrderCents };
    }

    const rawFeeCents = settings.fee_mode === "neighborhood"
      ? Number(neighborhood?.fee_cents ?? settings.default_fee_cents)
      : Number(settings.default_fee_cents);
    const freeThreshold = settings.free_delivery_over_cents === null ? null : Number(settings.free_delivery_over_cents);
    const feeCents = freeThreshold !== null && input.subtotalCents >= freeThreshold ? 0 : rawFeeCents;
    const extraMinutes = Number(neighborhood?.additional_minutes ?? 0);

    return {
      serviceable: true,
      feeCents,
      estimatedMinMinutes: Number(settings.estimated_min_minutes) + extraMinutes,
      estimatedMaxMinutes: Number(settings.estimated_max_minutes) + extraMinutes,
    };
  }
}
