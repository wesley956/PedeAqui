"use server";

import { OrderService } from "@/server/orders/order-service";

/** Read-only projection; OrderService.get enforces ORDERS_VIEW and tenant/store scope. */
export async function loadOrderPreviewAction(orderId: string) {
  try {
    const { order, items } = await OrderService.get(orderId);
    return { ok: true as const, detail: {
      id: String(order.id),
      subtotal: Number(order.subtotal_cents),
      deliveryFee: Number(order.delivery_fee_cents),
      discount: Number(order.discount_cents),
      total: Number(order.total_cents),
      paymentMethod: String(order.payment_method_snapshot ?? "Não informado"),
      changeFor: order.cash_change_for_cents == null ? null : Number(order.cash_change_for_cents),
      address: order.fulfillment_type === "delivery" ? [order.address_street_snapshot, order.address_number_snapshot, order.address_complement_snapshot, order.address_district_snapshot, order.address_city_snapshot, order.address_state_snapshot].filter(Boolean).join(", ") : null,
      reference: order.fulfillment_type === "delivery" ? order.address_reference_snapshot as string | null : null,
      items: items.map((item) => ({ id: item.id, quantity: item.quantity, name: item.product_name_snapshot, total: Number(item.line_total_cents), note: item.note, modifiers: item.modifiers.map((modifier) => modifier.modifier_name_snapshot) })),
    } };
  } catch {
    return { ok: false as const, error: "Não foi possível carregar este pedido. Tente novamente ou abra os detalhes." };
  }
}
