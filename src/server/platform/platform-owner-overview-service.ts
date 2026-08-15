import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { PlatformAdminService } from "@/server/platform/platform-admin-service";

const RECENT_ORDER_SAMPLE_LIMIT = 200;

export type PlatformUnitOverview = {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  status: string;
  city: string | null;
  state: string | null;
  isPrimary: boolean;
  recentOrders: number;
  lastOrderAt: string | null;
};

export type PlatformOwnerOverview = {
  activeUnits: number;
  totalUnits: number;
  ordersLast24h: number;
  openOrders: number;
  integrationAlerts: number;
  lastOrderAt: string | null;
  units: PlatformUnitOverview[];
  recentOrderStatus: Array<{ status: string; count: number }>;
};

function countByStatus(rows: Array<{ order_status: string }>) {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.order_status, (counts.get(row.order_status) ?? 0) + 1);
  return [...counts.entries()]
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count || a.status.localeCompare(b.status));
}

export class PlatformOwnerOverviewService {
  static async load(): Promise<PlatformOwnerOverview> {
    // The platform gate is intentionally resolved before the service-role client is used.
    // Only aggregate/support-safe fields are selected below; customer/order snapshots are never loaded.
    await PlatformAdminService.access();
    const admin = createAdminClient();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const [storesResult, orderCountResult, openOrderCountResult, recentOrdersResult, integrationAlertsResult] = await Promise.all([
      admin.from("stores")
        .select("id,organization_id,name,slug,status,city,state,is_primary,created_at")
        .order("created_at", { ascending: false })
        .limit(1000),
      admin.from("orders")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since),
      admin.from("orders")
        .select("id", { count: "exact", head: true })
        .in("order_status", ["pending_confirmation", "confirmed"]),
      admin.from("orders")
        .select("store_id,order_status,created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(RECENT_ORDER_SAMPLE_LIMIT),
      admin.from("integration_webhook_deliveries")
        .select("id", { count: "exact", head: true })
        .eq("status", "dead"),
    ]);

    for (const result of [storesResult, orderCountResult, openOrderCountResult, recentOrdersResult, integrationAlertsResult]) {
      if (result.error) throw result.error;
    }

    const recentRows = recentOrdersResult.data ?? [];
    const activityByStore = new Map<string, { count: number; lastOrderAt: string | null }>();
    for (const row of recentRows) {
      const current = activityByStore.get(row.store_id) ?? { count: 0, lastOrderAt: null };
      current.count += 1;
      if (!current.lastOrderAt || row.created_at > current.lastOrderAt) current.lastOrderAt = row.created_at;
      activityByStore.set(row.store_id, current);
    }

    const units = (storesResult.data ?? []).map((store) => {
      const activity = activityByStore.get(store.id);
      return {
        id: store.id,
        organizationId: store.organization_id,
        name: store.name,
        slug: store.slug,
        status: store.status,
        city: store.city,
        state: store.state,
        isPrimary: Boolean(store.is_primary),
        recentOrders: activity?.count ?? 0,
        lastOrderAt: activity?.lastOrderAt ?? null,
      } satisfies PlatformUnitOverview;
    });

    return {
      activeUnits: units.filter((unit) => unit.status === "active").length,
      totalUnits: units.length,
      ordersLast24h: orderCountResult.count ?? 0,
      openOrders: openOrderCountResult.count ?? 0,
      integrationAlerts: integrationAlertsResult.count ?? 0,
      lastOrderAt: recentRows[0]?.created_at ?? null,
      units,
      recentOrderStatus: countByStatus(recentRows),
    };
  }
}
