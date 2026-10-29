import "server-only";
import { PublicOrderService } from "@/server/orders/public-order-service";
import { readRecentOrders } from "@/server/orders/recent-order-token";

/** Each entry is authorized with the existing order token, never a phone number. */
export async function loadRecentPublicOrders(slug: string, value: string | null | undefined) {
  const orders = await Promise.all(readRecentOrders(value).map(({ orderId, accessToken }) => PublicOrderService.getTracking(slug, orderId, accessToken)));
  return orders.filter((order) => order !== null);
}

export function recentOrderStatus(order: { order_status: string; payment_status: string; production_status: string; fulfillment_status: string }) {
  if (order.order_status === "canceled") return "Cancelado";
  if (order.order_status === "rejected") return "Não aceito";
  if (order.order_status === "completed") return "Concluído";
  if (order.fulfillment_status === "delivered") return "Entregue";
  if (order.fulfillment_status === "picked_up_by_customer") return "Retirado";
  if (order.fulfillment_status === "out_for_delivery") return "Saiu para entrega";
  if (order.production_status === "ready") return "Pronto";
  if (order.production_status === "preparing" || order.production_status === "queued") return "Em preparo";
  if (order.payment_status === "pending") return "Pagamento pendente";
  return "Recebido pela loja";
}
