import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashOrderAccessToken } from "@/server/orders/order-token";

const uuidSchema = z.string().uuid();

export class PublicOrderService {
  static async get(storeSlug: string, orderId: string, accessToken: string) {
    const id = uuidSchema.parse(orderId);
    const admin = createAdminClient();
    const { data: store, error: storeError } = await admin.from("stores")
      .select("id, organization_id, name, slug")
      .ilike("slug", storeSlug).maybeSingle();
    if (storeError) throw storeError;
    if (!store) return null;

    const [orderResult, itemsResult] = await Promise.all([
      admin.from("orders")
        .select("id, display_number, channel, fulfillment_type, order_status, payment_status, production_status, fulfillment_status, customer_name_snapshot, address_street_snapshot, address_number_snapshot, address_complement_snapshot, address_district_snapshot, address_city_snapshot, address_state_snapshot, subtotal_cents, discount_cents, delivery_fee_cents, total_cents, payment_method_snapshot, cash_change_for_cents, delivery_estimated_min_minutes, delivery_estimated_max_minutes, confirmed_at, completed_at, canceled_at, cancel_reason, created_at, updated_at")
        .eq("id", id)
        .eq("organization_id", store.organization_id)
        .eq("store_id", store.id)
        .eq("public_access_token_hash", hashOrderAccessToken(accessToken))
        .maybeSingle(),
      admin.from("order_items")
        .select("id, product_name_snapshot, quantity, note, unit_total_price_cents, line_total_cents")
        .eq("organization_id", store.organization_id).eq("store_id", store.id).eq("order_id", id)
        .order("created_at"),
    ]);
    if (orderResult.error) throw orderResult.error;
    if (itemsResult.error) throw itemsResult.error;
    const order = orderResult.data;
    if (!order) return null;

    const items = itemsResult.data ?? [];
    const itemIds = items.map((item) => item.id);
    const modifiersResult = itemIds.length > 0
      ? await admin.from("order_item_modifiers")
        .select("order_item_id, modifier_name_snapshot, unit_price_cents")
        .eq("organization_id", store.organization_id).eq("store_id", store.id)
        .in("order_item_id", itemIds).order("created_at")
      : { data: [], error: null };
    if (modifiersResult.error) throw modifiersResult.error;

    return {
      store,
      order,
      items: items.map((item) => ({
        ...item,
        modifiers: (modifiersResult.data ?? []).filter((modifier) => modifier.order_item_id === item.id),
      })),
    };
  }
}
