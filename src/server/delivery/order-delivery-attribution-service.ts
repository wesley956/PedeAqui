import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";

function requireStore(storeId: string | null) {
  if (!storeId) throw new Error("Uma unidade ativa é necessária");
  return storeId;
}

export type OrderDeliveryAttribution = {
  driverName: string;
  deliveredAt: string | null;
};

export class OrderDeliveryAttributionService {
  static async forOrders(orderIds: string[]) {
    const context = await authorize(PERMISSIONS.ORDERS_VIEW);
    const storeId = requireStore(context.storeId);
    const uniqueOrderIds = [...new Set(orderIds)].filter(Boolean);
    if (uniqueOrderIds.length === 0) return new Map<string, OrderDeliveryAttribution>();

    const admin = createAdminClient();
    const { data: deliveries, error: deliveryError } = await admin.from("deliveries")
      .select("order_id,driver_id,delivered_at")
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .in("order_id", uniqueOrderIds)
      .not("driver_id", "is", null);
    if (deliveryError) throw deliveryError;

    const driverIds = [...new Set((deliveries ?? []).map((row) => row.driver_id).filter((value): value is string => Boolean(value)))];
    const driversResult = driverIds.length > 0
      ? await admin.from("drivers")
        .select("id,name")
        .eq("organization_id", context.organizationId)
        .eq("store_id", storeId)
        .in("id", driverIds)
      : { data: [], error: null };
    if (driversResult.error) throw driversResult.error;

    const driverNames = new Map((driversResult.data ?? []).map((driver) => [driver.id, driver.name]));
    const result = new Map<string, OrderDeliveryAttribution>();
    for (const delivery of deliveries ?? []) {
      if (!delivery.driver_id) continue;
      result.set(delivery.order_id, {
        driverName: driverNames.get(delivery.driver_id) ?? "Entregador não encontrado",
        deliveredAt: delivery.delivered_at,
      });
    }
    return result;
  }
}
