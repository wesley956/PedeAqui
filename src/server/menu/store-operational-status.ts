import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { PublicHour } from "@/server/menu/schedule";
import { resolveStoreOperationalStatus } from "@/server/menu/store-operational-status-core";

export {
  resolveStoreOperationalStatus,
  storeClosedOrderMessage,
  storeOperationalHoursMessage,
} from "@/server/menu/store-operational-status-core";
export type {
  StoreOperationalLabel,
  StoreOperationalReason,
  StoreOperationalStatus,
} from "@/server/menu/store-operational-status-core";

export class StoreOperationalStatusService {
  static async load(input: { organizationId: string; storeId: string; now?: Date }) {
    const admin = createAdminClient();
    const [storeResult, settingsResult, hoursResult] = await Promise.all([
      admin.from("stores")
        .select("status, timezone")
        .eq("organization_id", input.organizationId)
        .eq("id", input.storeId)
        .maybeSingle(),
      admin.from("store_menu_settings")
        .select("accepting_orders, pause_reason, allow_delivery, allow_pickup")
        .eq("organization_id", input.organizationId)
        .eq("store_id", input.storeId)
        .maybeSingle(),
      admin.from("store_hours")
        .select("weekday, opens_at, closes_at, closes_next_day")
        .eq("organization_id", input.organizationId)
        .eq("store_id", input.storeId)
        .eq("active", true)
        .order("weekday")
        .order("sort_order")
        .order("opens_at"),
    ]);
    if (storeResult.error) throw storeResult.error;
    if (settingsResult.error) throw settingsResult.error;
    if (hoursResult.error) throw hoursResult.error;
    if (!storeResult.data) throw new Error("Store not found");

    const settings = settingsResult.data;
    return resolveStoreOperationalStatus({
      storeStatus: storeResult.data.status,
      acceptingOrders: settings?.accepting_orders ?? true,
      pauseReason: settings?.pause_reason ?? null,
      allowDelivery: settings?.allow_delivery ?? true,
      allowPickup: settings?.allow_pickup ?? true,
      hours: (hoursResult.data ?? []) as PublicHour[],
      timeZone: storeResult.data.timezone || "America/Sao_Paulo",
      now: input.now,
    });
  }
}
