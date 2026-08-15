import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { PlatformAdminService } from "@/server/platform/platform-admin-service";

export class PlatformSupportReadService {
  static async load(organizationId: string, storeId: string) {
    const access = await PlatformAdminService.access();
    if (access.role !== "super_admin") return { role: access.role, config: null } as const;
    const admin = createAdminClient();
    const [store, menu, hours, delivery, payments] = await Promise.all([
      admin.from("stores").select("status").eq("organization_id", organizationId).eq("id", storeId).maybeSingle(),
      admin.from("store_menu_settings").select("active,accepting_orders,allow_delivery,allow_pickup,pause_reason").eq("organization_id", organizationId).eq("store_id", storeId).maybeSingle(),
      admin.from("store_hours").select("id,weekday,opens_at,closes_at,closes_next_day,active").eq("organization_id", organizationId).eq("store_id", storeId).order("weekday").order("sort_order"),
      admin.from("store_delivery_settings").select("enabled,fee_mode,default_fee_cents,estimated_min_minutes,estimated_max_minutes,require_neighborhood_match").eq("organization_id", organizationId).eq("store_id", storeId).maybeSingle(),
      admin.from("store_payment_methods").select("method,enabled,sort_order").eq("organization_id", organizationId).eq("store_id", storeId).order("sort_order"),
    ]);
    for (const result of [store, menu, hours, delivery, payments]) if (result.error) throw result.error;
    if (!store.data) throw new Error("Unidade não encontrada para a empresa selecionada.");
    return {
      role: access.role,
      config: {
        storeStatus: store.data.status,
        menu: menu.data ?? null,
        hours: hours.data ?? [],
        delivery: delivery.data ?? null,
        payments: payments.data ?? [],
      },
    } as const;
  }
}
