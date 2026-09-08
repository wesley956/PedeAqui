"use server";

import { OrderPresentationService } from "@/server/orders/order-presentation-service";

export async function resolveOrderManagerRealtimeAction(orderId: string) {
  return OrderPresentationService.getManagerRow(orderId);
}
