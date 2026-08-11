import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import type {
  KitchenOrder,
  KitchenProductionStatus,
  KitchenStation,
} from "@/features/kitchen/kitchen-model";

function requireStoreId(storeId: string | null) {
  if (!storeId) throw new Error("An active store is required");
  return storeId;
}

export class KitchenService {
  static async snapshot(limit = 120) {
    const snapshotAt = Date.now();
    const context = await authorize(PERMISSIONS.ORDERS_VIEW);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();

    const [stationsResult, ordersResult] = await Promise.all([
      admin.from("production_stations")
        .select("id, name, code, sort_order")
        .eq("organization_id", context.organizationId)
        .eq("store_id", storeId)
        .eq("kind", "production")
        .eq("active", true)
        .order("sort_order")
        .order("name"),
      admin.from("orders")
        .select("id, display_number, customer_name_snapshot, fulfillment_type, production_status, confirmed_at, created_at")
        .eq("organization_id", context.organizationId)
        .eq("store_id", storeId)
        .eq("order_status", "confirmed")
        .in("production_status", ["pending_confirmation", "queued", "preparing", "ready"])
        .order("created_at", { ascending: true })
        .limit(Math.min(Math.max(limit, 1), 250)),
    ]);

    if (stationsResult.error) throw stationsResult.error;
    if (ordersResult.error) throw ordersResult.error;

    const orders = ordersResult.data ?? [];
    const orderIds = orders.map((order) => order.id);
    const stations: KitchenStation[] = (stationsResult.data ?? []).map((station) => ({
      id: station.id,
      name: station.name,
      code: station.code,
      sortOrder: Number(station.sort_order),
    }));

    if (orderIds.length === 0) {
      return { context, storeId, stations, orders: [] as KitchenOrder[], snapshotAt };
    }

    const { data: items, error: itemsError } = await admin.from("order_items")
      .select("id, order_id, product_id, product_name_snapshot, quantity, note, created_at")
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .in("order_id", orderIds)
      .order("created_at");
    if (itemsError) throw itemsError;

    const itemRows = items ?? [];
    const itemIds = itemRows.map((item) => item.id);
    const productIds = [...new Set(itemRows.map((item) => item.product_id).filter((id): id is string => Boolean(id)))];

    const [modifierResult, routeResult] = await Promise.all([
      itemIds.length > 0
        ? admin.from("order_item_modifiers")
          .select("order_item_id, group_name_snapshot, modifier_name_snapshot, created_at")
          .eq("organization_id", context.organizationId)
          .eq("store_id", storeId)
          .in("order_item_id", itemIds)
          .order("created_at")
        : Promise.resolve({ data: [], error: null }),
      productIds.length > 0
        ? admin.from("product_production_stations")
          .select("product_id, station_id")
          .eq("organization_id", context.organizationId)
          .eq("store_id", storeId)
          .in("product_id", productIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (modifierResult.error) throw modifierResult.error;
    if (routeResult.error) throw routeResult.error;

    const modifiersByItem = new Map<string, { name: string; groupName: string }[]>();
    for (const modifier of modifierResult.data ?? []) {
      const current = modifiersByItem.get(modifier.order_item_id) ?? [];
      current.push({ name: modifier.modifier_name_snapshot, groupName: modifier.group_name_snapshot });
      modifiersByItem.set(modifier.order_item_id, current);
    }

    const stationsByProduct = new Map<string, string[]>();
    for (const route of routeResult.data ?? []) {
      const current = stationsByProduct.get(route.product_id) ?? [];
      current.push(route.station_id);
      stationsByProduct.set(route.product_id, current);
    }

    const itemsByOrder = new Map<string, KitchenOrder["items"]>();
    for (const item of itemRows) {
      const current = itemsByOrder.get(item.order_id) ?? [];
      current.push({
        id: item.id,
        productId: item.product_id,
        name: item.product_name_snapshot,
        quantity: Number(item.quantity),
        note: item.note,
        stationIds: item.product_id ? (stationsByProduct.get(item.product_id) ?? []) : [],
        modifiers: modifiersByItem.get(item.id) ?? [],
      });
      itemsByOrder.set(item.order_id, current);
    }

    const kitchenOrders: KitchenOrder[] = orders.map((order) => ({
      id: order.id,
      displayNumber: Number(order.display_number),
      customerName: order.customer_name_snapshot,
      fulfillmentType: order.fulfillment_type,
      productionStatus: order.production_status as KitchenProductionStatus,
      confirmedAt: order.confirmed_at,
      createdAt: order.created_at,
      items: itemsByOrder.get(order.id) ?? [],
    }));

    return { context, storeId, stations, orders: kitchenOrders, snapshotAt };
  }
}
