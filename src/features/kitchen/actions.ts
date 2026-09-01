"use server";

import { KitchenService } from "@/server/kitchen/kitchen-service";

export async function resolveKitchenRealtimeOrderAction(orderId: string) {
  try {
    return await KitchenService.projection(orderId);
  } catch {
    return null;
  }
}
