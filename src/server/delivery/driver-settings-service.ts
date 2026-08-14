import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";

export class DriverSettingsService {
  static async load() {
    const context = await authorize(PERMISSIONS.DELIVERY_MANAGE);
    if (!context.storeId) throw new Error("Uma unidade ativa é necessária");
    const admin = createAdminClient();

    const [driversResult, activeDeliveriesResult] = await Promise.all([
      admin.from("drivers")
        .select("id,user_id,name,phone,active,on_duty,max_active_deliveries,updated_at")
        .eq("organization_id", context.organizationId)
        .eq("store_id", context.storeId)
        .is("deleted_at", null)
        .order("name"),
      admin.from("deliveries")
        .select("driver_id,orders!inner(fulfillment_status)")
        .eq("organization_id", context.organizationId)
        .eq("store_id", context.storeId)
        .not("driver_id", "is", null)
        .in("orders.fulfillment_status", ["assigned", "picked_up", "out_for_delivery"]),
    ]);
    if (driversResult.error) throw driversResult.error;
    if (activeDeliveriesResult.error) throw activeDeliveriesResult.error;

    const activeByDriver = new Map<string, number>();
    for (const delivery of activeDeliveriesResult.data ?? []) {
      if (!delivery.driver_id) continue;
      activeByDriver.set(delivery.driver_id, (activeByDriver.get(delivery.driver_id) ?? 0) + 1);
    }

    return {
      context,
      drivers: (driversResult.data ?? []).map((driver) => ({
        ...driver,
        max_active_deliveries: Number(driver.max_active_deliveries),
        activeDeliveries: activeByDriver.get(driver.id) ?? 0,
      })),
    };
  }
}
