import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashOrderAccessToken } from "@/server/orders/order-token";
import { groupPublicOrderModifiers, type PublicOrderModifierProjection } from "@/server/orders/public-order-projection";
import { OrderPixService, type PublicPixPayment } from "@/server/payments/order-pix-service";

const uuidSchema = z.string().uuid();

export type PublicOrderTrackingProjection = {
  store: {
    id: string;
    organization_id: string;
    name: string;
    slug: string;
    business_type: string;
    timezone: string | null;
  };
  order: {
    id: string;
    display_number: number;
    channel: string;
    fulfillment_type: string;
    order_status: string;
    payment_status: string;
    production_status: string;
    fulfillment_status: string;
    total_cents: number;
    scheduled_for: string | null;
    delivery_estimated_min_minutes: number | null;
    delivery_estimated_max_minutes: number | null;
    confirmed_at: string | null;
    completed_at: string | null;
    canceled_at: string | null;
    created_at: string;
    updated_at: string;
  };
};

export class PublicOrderService {
  /**
   * Read-only projection for public tracking and Intelligence.
   *
   * This intentionally does not call OrderPixService.ensureForOrder (or any
   * other mutation-capable path). Access remains protected by the existing
   * public order token contract.
   */
  static async getTracking(storeSlug: string, orderId: string, accessToken: string): Promise<PublicOrderTrackingProjection | null> {
    const id = uuidSchema.parse(orderId);
    const admin = createAdminClient();
    const { data: store, error: storeError } = await admin.from("stores")
      .select("id, organization_id, name, slug, business_type, timezone")
      .ilike("slug", storeSlug).maybeSingle();
    if (storeError) throw storeError;
    if (!store) return null;

    const { data: order, error: orderError } = await admin.from("orders")
      .select("id, display_number, channel, fulfillment_type, order_status, payment_status, production_status, fulfillment_status, total_cents, scheduled_for, delivery_estimated_min_minutes, delivery_estimated_max_minutes, confirmed_at, completed_at, canceled_at, created_at, updated_at")
      .eq("id", id)
      .eq("organization_id", store.organization_id)
      .eq("store_id", store.id)
      .eq("public_access_token_hash", hashOrderAccessToken(accessToken))
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order) return null;

    return {
      store: {
        id: store.id,
        organization_id: store.organization_id,
        name: store.name,
        slug: store.slug,
        business_type: store.business_type,
        timezone: store.timezone,
      },
      order: {
        ...order,
        display_number: Number(order.display_number),
        total_cents: Number(order.total_cents),
      },
    };
  }

  static async get(storeSlug: string, orderId: string, accessToken: string) {
    const id = uuidSchema.parse(orderId);
    const admin = createAdminClient();
    const { data: store, error: storeError } = await admin.from("stores")
      .select("id, organization_id, name, slug, business_type, timezone")
      .ilike("slug", storeSlug).maybeSingle();
    if (storeError) throw storeError;
    if (!store) return null;

    const [orderResult, itemsResult] = await Promise.all([
      admin.from("orders")
        .select("id, display_number, channel, fulfillment_type, order_status, payment_status, production_status, fulfillment_status, customer_name_snapshot, address_street_snapshot, address_number_snapshot, address_complement_snapshot, address_district_snapshot, address_city_snapshot, address_state_snapshot, subtotal_cents, discount_cents, delivery_fee_cents, total_cents, payment_method_snapshot, cash_change_for_cents, scheduled_for, delivery_estimated_min_minutes, delivery_estimated_max_minutes, confirmed_at, completed_at, canceled_at, cancel_reason, created_at, updated_at")
        .eq("id", id).eq("organization_id", store.organization_id).eq("store_id", store.id)
        .eq("public_access_token_hash", hashOrderAccessToken(accessToken)).maybeSingle(),
      admin.from("order_items")
        .select("id, product_name_snapshot, quantity, note, unit_segment_price_cents, unit_total_price_cents, line_total_cents")
        .eq("organization_id", store.organization_id).eq("store_id", store.id).eq("order_id", id).order("created_at"),
    ]);
    if (orderResult.error) throw orderResult.error;
    if (itemsResult.error) throw itemsResult.error;
    const order = orderResult.data;
    if (!order) return null;

    let pixPayment: PublicPixPayment | null = null;
    if (order.payment_method_snapshot === "pix") {
      try {
        pixPayment = await OrderPixService.ensureForOrder(id);
      } catch {
        pixPayment = await OrderPixService.getExistingForOrder(id);
        if (!pixPayment && order.payment_status !== "paid") pixPayment = { status: "unavailable", amountCents: Number(order.total_cents), qrCode: null, qrCodeBase64: null, ticketUrl: null, expiresAt: null };
      }
    }

    const items = itemsResult.data ?? [];
    const itemIds = items.map((item) => item.id);
    const [modifiersResult, gasResult] = itemIds.length > 0 ? await Promise.all([
      admin.from("order_item_modifiers").select("order_item_id, modifier_name_snapshot, unit_price_cents, quantity").eq("organization_id", store.organization_id).eq("store_id", store.id).in("order_item_id", itemIds).order("created_at"),
      admin.from("order_item_gas_options").select("order_item_id,sale_mode,container_code_snapshot,container_name_snapshot,unit_container_price_cents").eq("organization_id", store.organization_id).eq("store_id", store.id).in("order_item_id", itemIds),
    ]) : [{ data: [], error: null }, { data: [], error: null }];
    if (modifiersResult.error) throw modifiersResult.error;
    if (gasResult.error) throw gasResult.error;
    const modifiersByItem = groupPublicOrderModifiers((modifiersResult.data ?? []) as PublicOrderModifierProjection[]);

    return {
      store,
      order,
      pixPayment,
      items: items.map((item) => ({
        ...item,
        modifiers: modifiersByItem.get(item.id) ?? [],
        gas: (gasResult.data ?? []).find((option) => option.order_item_id === item.id) ?? null,
      })),
    };
  }
}