import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { dashboardSnapshotSchema } from "@/server/dashboard/dashboard-model";

function localDate(iso: string, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export class DashboardService {
  static async snapshot(now = new Date()) {
    const context = await authorize(PERMISSIONS.DASHBOARD_VIEW);
    if (!context.storeId) throw new Error("An active store is required");

    const admin = createAdminClient();
    const { data, error } = await admin.rpc("dashboard_snapshot_internal", {
      p_store_id: context.storeId,
      p_now: now.toISOString(),
    });
    if (error) throw error;
    const snapshot = dashboardSnapshotSchema.parse(data);

    // Pull a bounded 48h transition window, then classify by the store timezone from
    // the canonical snapshot. This avoids inventing UTC/local-day boundaries in UI code.
    const transitionWindowStart = new Date(Date.parse(snapshot.generated_at) - 48 * 60 * 60 * 1000).toISOString();
    const [cancellationsResult, cashSessionsResult, inventoryConfigsResult, inventoryBalancesResult, inventoryItemsResult, lateCandidatesResult] = await Promise.all([
      admin.from("order_state_history")
        .select("id,to_state,created_at")
        .eq("organization_id", context.organizationId)
        .eq("store_id", context.storeId)
        .eq("state_domain", "order")
        .in("to_state", ["canceled", "rejected"])
        .gte("created_at", transitionWindowStart),
      admin.from("cash_sessions")
        .select("id,cash_register_id,opened_at")
        .eq("organization_id", context.organizationId)
        .eq("store_id", context.storeId)
        .eq("status", "open"),
      admin.from("inventory_item_stores")
        .select("inventory_item_id,minimum_quantity,active")
        .eq("organization_id", context.organizationId)
        .eq("store_id", context.storeId),
      admin.from("inventory_balances")
        .select("inventory_item_id,quantity")
        .eq("organization_id", context.organizationId)
        .eq("store_id", context.storeId),
      admin.from("inventory_items")
        .select("id,name")
        .eq("organization_id", context.organizationId)
        .is("deleted_at", null),
      admin.from("deliveries")
        .select("order_id,promised_by_at,delivered_at")
        .eq("organization_id", context.organizationId)
        .eq("store_id", context.storeId)
        .is("delivered_at", null)
        .not("promised_by_at", "is", null)
        .lt("promised_by_at", snapshot.generated_at),
    ]);
    for (const result of [cancellationsResult, cashSessionsResult, inventoryConfigsResult, inventoryBalancesResult, inventoryItemsResult, lateCandidatesResult]) {
      if (result.error) throw result.error;
    }

    const cancellationsToday = (cancellationsResult.data ?? []).filter((row) => localDate(row.created_at, snapshot.timezone) === snapshot.local_date).length;

    // Same definition used by /estoque: configured item whose projected balance is
    // less than or equal to the configured minimum quantity.
    const balanceByItem = new Map((inventoryBalancesResult.data ?? []).map((row) => [row.inventory_item_id, Number(row.quantity)]));
    const nameByItem = new Map((inventoryItemsResult.data ?? []).map((row) => [row.id, row.name]));
    const criticalStock = (inventoryConfigsResult.data ?? [])
      .filter((row) => (balanceByItem.get(row.inventory_item_id) ?? 0) <= Number(row.minimum_quantity))
      .map((row) => ({
        id: row.inventory_item_id,
        name: nameByItem.get(row.inventory_item_id) ?? "Insumo",
        quantity: balanceByItem.get(row.inventory_item_id) ?? 0,
        minimumQuantity: Number(row.minimum_quantity),
        active: row.active,
      }));

    const lateOrderIds = [...new Set((lateCandidatesResult.data ?? []).map((row) => row.order_id))];
    let lateDeliveries = 0;
    if (lateOrderIds.length > 0) {
      const { data: lateOrders, error: lateOrdersError } = await admin.from("orders")
        .select("id")
        .eq("organization_id", context.organizationId)
        .eq("store_id", context.storeId)
        .eq("order_status", "confirmed")
        .in("fulfillment_status", ["pending", "awaiting_assignment", "assigned", "picked_up", "out_for_delivery"])
        .in("id", lateOrderIds);
      if (lateOrdersError) throw lateOrdersError;
      lateDeliveries = lateOrders?.length ?? 0;
    }

    return {
      context,
      snapshot,
      operations: {
        cancellationsToday,
        openCashSessions: cashSessionsResult.data?.length ?? 0,
        lateDeliveries,
        criticalStockCount: criticalStock.length,
        criticalStock: criticalStock.slice(0, 5),
      },
    };
  }
}
