import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { AuditService } from "@/server/audit/audit-service";
import { EventService } from "@/server/events/event-service";
import { DeliveryQuoteService } from "@/server/delivery/delivery-quote-service";
import { deliveryNeighborhoodInputSchema, deliverySettingsInputSchema, type DeliveryNeighborhoodInput, type DeliverySettingsInput } from "@/server/delivery/schemas";
import { neighborhoodKey } from "@/server/delivery/location-key";

const uuidSchema = z.string().uuid();

function requireStoreId(storeId: string | null) {
  if (!storeId) throw new Error("An active store is required");
  return storeId;
}

const defaults = {
  enabled: true,
  fee_mode: "neighborhood" as const,
  default_fee_cents: 0,
  free_delivery_over_cents: null,
  estimated_min_minutes: 30,
  estimated_max_minutes: 60,
  max_distance_km: null,
  require_neighborhood_match: true,
};

export class DeliveryService {
  static async getSettings() {
    const context = await authorize(PERMISSIONS.DELIVERY_VIEW);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const { data, error } = await admin.from("store_delivery_settings")
      .select("enabled, fee_mode, default_fee_cents, free_delivery_over_cents, estimated_min_minutes, estimated_max_minutes, max_distance_km, require_neighborhood_match")
      .eq("organization_id", context.organizationId).eq("store_id", storeId).maybeSingle();
    if (error) throw error;
    return data ?? defaults;
  }

  static async saveSettings(input: DeliverySettingsInput) {
    const values = deliverySettingsInputSchema.parse(input);
    const context = await authorize(PERMISSIONS.DELIVERY_MANAGE);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const { data: before, error: readError } = await admin.from("store_delivery_settings")
      .select("*").eq("organization_id", context.organizationId).eq("store_id", storeId).maybeSingle();
    if (readError) throw readError;

    const { data, error } = await admin.from("store_delivery_settings").upsert({
      organization_id: context.organizationId,
      store_id: storeId,
      enabled: values.enabled,
      fee_mode: values.feeMode,
      default_fee_cents: values.defaultFeeCents,
      free_delivery_over_cents: values.freeDeliveryOverCents ?? null,
      estimated_min_minutes: values.estimatedMinMinutes,
      estimated_max_minutes: values.estimatedMaxMinutes,
      require_neighborhood_match: values.requireNeighborhoodMatch,
      updated_at: new Date().toISOString(),
    }, { onConflict: "store_id" }).select("enabled, fee_mode, default_fee_cents, free_delivery_over_cents, estimated_min_minutes, estimated_max_minutes, max_distance_km, require_neighborhood_match").single();
    if (error) throw error;

    await AuditService.record(context, { action: "delivery.settings_updated", entityType: "store", entityId: storeId, before, after: data });
    await EventService.enqueue(context, { type: "delivery.settings_updated", entityType: "store", entityId: storeId, payload: { enabled: data.enabled, fee_mode: data.fee_mode } });
    return data;
  }

  static async listNeighborhoods() {
    const context = await authorize(PERMISSIONS.DELIVERY_VIEW);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const { data, error } = await admin.from("delivery_neighborhoods")
      .select("id, neighborhood_name, city, state, fee_cents, minimum_order_cents, additional_minutes, active, created_at")
      .eq("organization_id", context.organizationId).eq("store_id", storeId).is("deleted_at", null)
      .order("neighborhood_name");
    if (error) throw error;
    return data ?? [];
  }

  static async createNeighborhood(input: DeliveryNeighborhoodInput) {
    const values = deliveryNeighborhoodInputSchema.parse(input);
    const context = await authorize(PERMISSIONS.DELIVERY_MANAGE);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const key = neighborhoodKey(values.neighborhoodName, values.city, values.state);
    const { data, error } = await admin.from("delivery_neighborhoods").insert({
      organization_id: context.organizationId,
      store_id: storeId,
      neighborhood_name: values.neighborhoodName,
      neighborhood_key: key,
      city: values.city,
      state: values.state,
      fee_cents: values.feeCents,
      minimum_order_cents: values.minimumOrderCents ?? null,
      additional_minutes: values.additionalMinutes,
      active: values.active,
      created_by: context.userId,
      updated_by: context.userId,
    }).select("id, neighborhood_name, city, state, fee_cents, minimum_order_cents, additional_minutes, active").single();
    if (error) throw error;
    await AuditService.record(context, { action: "delivery.neighborhood_created", entityType: "delivery_neighborhood", entityId: data.id, after: data });
    await EventService.enqueue(context, { type: "delivery.neighborhood_changed", entityType: "store", entityId: storeId, payload: { neighborhood_id: data.id } });
    return data;
  }

  static async setNeighborhoodActive(neighborhoodId: string, active: boolean) {
    const id = uuidSchema.parse(neighborhoodId);
    const context = await authorize(PERMISSIONS.DELIVERY_MANAGE);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const { data, error } = await admin.from("delivery_neighborhoods").update({ active, updated_by: context.userId, updated_at: new Date().toISOString() })
      .eq("id", id).eq("organization_id", context.organizationId).eq("store_id", storeId).is("deleted_at", null)
      .select("id, neighborhood_name, active").single();
    if (error) throw error;
    await AuditService.record(context, { action: "delivery.neighborhood_status_changed", entityType: "delivery_neighborhood", entityId: id, after: data });
    return data;
  }

  static async removeNeighborhood(neighborhoodId: string) {
    const id = uuidSchema.parse(neighborhoodId);
    const context = await authorize(PERMISSIONS.DELIVERY_MANAGE);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const { data: before, error: readError } = await admin.from("delivery_neighborhoods").select("id, neighborhood_name, fee_cents")
      .eq("id", id).eq("organization_id", context.organizationId).eq("store_id", storeId).is("deleted_at", null).single();
    if (readError) throw readError;
    const { error } = await admin.from("delivery_neighborhoods").update({ deleted_at: new Date().toISOString(), active: false, updated_by: context.userId, updated_at: new Date().toISOString() })
      .eq("id", id).eq("organization_id", context.organizationId).eq("store_id", storeId);
    if (error) throw error;
    await AuditService.record(context, { action: "delivery.neighborhood_removed", entityType: "delivery_neighborhood", entityId: id, before });
  }

  static async quoteByNeighborhood(neighborhood: string, city: string, state: string, subtotalCents: number) {
    const context = await authorize(PERMISSIONS.DELIVERY_VIEW);
    const storeId = requireStoreId(context.storeId);
    return DeliveryQuoteService.quote({
      organizationId: context.organizationId,
      storeId,
      subtotalCents,
      address: { district: neighborhood, city, state },
    });
  }
}
