import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { groupPublicOrderModifiers, type PublicOrderModifierProjection } from "@/server/orders/public-order-projection";

export type OrderNotificationSummaryItem = {
  name: string;
  quantity: number;
  note: string | null;
  lineTotalCents: number;
  modifiers: Array<{
    name: string;
    quantity: number;
    unitPriceCents: number;
  }>;
};

export type OrderNotificationSummary = {
  orderId: string;
  displayNumber: number;
  channel: string;
  fulfillmentType: string;
  paymentMethod: string | null;
  subtotalCents: number;
  discountCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  cancelReason: string | null;
  items: OrderNotificationSummaryItem[];
};

export class OrderNotificationSummaryService {
  static async load(input: {
    organizationId: string;
    storeId: string;
    orderId: string;
  }): Promise<OrderNotificationSummary | null> {
    const admin = createAdminClient();
    const [orderResult, itemsResult] = await Promise.all([
      admin.from("orders")
        .select("id, display_number, channel, fulfillment_type, payment_method_snapshot, subtotal_cents, discount_cents, delivery_fee_cents, total_cents, cancel_reason")
        .eq("id", input.orderId)
        .eq("organization_id", input.organizationId)
        .eq("store_id", input.storeId)
        .maybeSingle(),
      admin.from("order_items")
        .select("id, product_name_snapshot, quantity, note, line_total_cents")
        .eq("organization_id", input.organizationId)
        .eq("store_id", input.storeId)
        .eq("order_id", input.orderId)
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
          .select("order_item_id, modifier_name_snapshot, unit_price_cents, quantity")
          .eq("organization_id", input.organizationId)
          .eq("store_id", input.storeId)
          .in("order_item_id", itemIds)
          .order("created_at")
      : { data: [], error: null };
    if (modifiersResult.error) throw modifiersResult.error;

    const modifiersByItem = groupPublicOrderModifiers(
      (modifiersResult.data ?? []) as PublicOrderModifierProjection[],
    );

    return {
      orderId: order.id,
      displayNumber: Number(order.display_number),
      channel: String(order.channel ?? ""),
      fulfillmentType: String(order.fulfillment_type ?? ""),
      paymentMethod: order.payment_method_snapshot ? String(order.payment_method_snapshot) : null,
      subtotalCents: Number(order.subtotal_cents ?? 0),
      discountCents: Number(order.discount_cents ?? 0),
      deliveryFeeCents: Number(order.delivery_fee_cents ?? 0),
      totalCents: Number(order.total_cents ?? 0),
      cancelReason: typeof order.cancel_reason === "string" && order.cancel_reason.trim()
        ? order.cancel_reason.trim()
        : null,
      items: items.map((item) => ({
        name: String(item.product_name_snapshot ?? "Item"),
        quantity: Number(item.quantity ?? 0),
        note: typeof item.note === "string" && item.note.trim() ? item.note.trim() : null,
        lineTotalCents: Number(item.line_total_cents ?? 0),
        modifiers: (modifiersByItem.get(item.id) ?? []).map((modifier) => ({
          name: String(modifier.modifier_name_snapshot ?? "Adicional"),
          quantity: Number(modifier.quantity ?? 0),
          unitPriceCents: Number(modifier.unit_price_cents ?? 0),
        })),
      })),
    };
  }
}
