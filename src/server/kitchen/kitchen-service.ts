import "server-only";

import { z } from "zod";
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

const operationalPageSize = 200;
const relationChunkSize = 100;
function chunks<T>(values: readonly T[], size = relationChunkSize) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

type KitchenOrderRow = {
  id: string; display_number: number; customer_name_snapshot: string; fulfillment_type: string;
  production_status: string; confirmed_at: string | null; created_at: string;
};

export class KitchenService {
  static async snapshot() {
    const snapshotAt = Date.now();
    const context = await authorize(PERMISSIONS.ORDERS_VIEW);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();

    const stationsPromise = admin.from("production_stations")
        .select("id, name, code, sort_order")
        .eq("organization_id", context.organizationId)
        .eq("store_id", storeId)
        .eq("kind", "production")
        .eq("active", true)
        .order("sort_order")
        .order("name");
    const orders: KitchenOrderRow[] = [];
    for (let from = 0; ; from += operationalPageSize) {
      const ordersResult = await admin.from("orders")
        .select("id, display_number, customer_name_snapshot, fulfillment_type, production_status, confirmed_at, created_at")
        .eq("organization_id", context.organizationId)
        .eq("store_id", storeId)
        .eq("order_status", "confirmed")
        .in("production_status", ["pending_confirmation", "queued", "preparing", "ready"])
        .order("created_at", { ascending: true })
        .range(from, from + operationalPageSize - 1);
      if (ordersResult.error) throw ordersResult.error;
      orders.push(...((ordersResult.data ?? []) as KitchenOrderRow[]));
      if ((ordersResult.data?.length ?? 0) < operationalPageSize) break;
    }
    const stationsResult = await stationsPromise;

    if (stationsResult.error) throw stationsResult.error;
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

    const itemResults = await Promise.all(chunks(orderIds).map((ids) => admin.from("order_items")
      .select("id, order_id, product_id, product_name_snapshot, quantity, note, created_at")
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .in("order_id", ids)
      .order("created_at")));
    for (const result of itemResults) if (result.error) throw result.error;
    const itemRows = itemResults.flatMap((result) => result.data ?? []);
    const itemIds = itemRows.map((item) => item.id);
    const productIds = [...new Set(itemRows.map((item) => item.product_id).filter((id): id is string => Boolean(id)))];

    const [modifierResults, routeResults] = await Promise.all([
      Promise.all(chunks(itemIds).map((ids) => admin.from("order_item_modifiers")
          .select("order_item_id, group_name_snapshot, modifier_name_snapshot, created_at")
          .eq("organization_id", context.organizationId)
          .eq("store_id", storeId)
          .in("order_item_id", ids)
          .order("created_at"))),
      Promise.all(chunks(productIds).map((ids) => admin.from("product_production_stations")
          .select("product_id, station_id")
          .eq("organization_id", context.organizationId)
          .eq("store_id", storeId)
          .in("product_id", ids))),
    ]);

    for (const result of [...modifierResults, ...routeResults]) if (result.error) throw result.error;
    const modifierRows = modifierResults.flatMap((result) => result.data ?? []);
    const routeRows = routeResults.flatMap((result) => result.data ?? []);

    const modifiersByItem = new Map<string, { name: string; groupName: string }[]>();
    for (const modifier of modifierRows) {
      const current = modifiersByItem.get(modifier.order_item_id) ?? [];
      current.push({ name: modifier.modifier_name_snapshot, groupName: modifier.group_name_snapshot });
      modifiersByItem.set(modifier.order_item_id, current);
    }

    const stationsByProduct = new Map<string, string[]>();
    for (const route of routeRows) {
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

    return { context, storeId, stations, orders: kitchenOrders, snapshotAt, overloaded: kitchenOrders.length > 120 };
  }

  static async projection(orderId: string): Promise<KitchenOrder | null> {
    const id = z.string().uuid().parse(orderId);
    const context = await authorize(PERMISSIONS.ORDERS_VIEW);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const orderResult = await admin.from("orders")
      .select("id, display_number, customer_name_snapshot, fulfillment_type, production_status, confirmed_at, created_at")
      .eq("id", id)
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .eq("order_status", "confirmed")
      .in("production_status", ["pending_confirmation", "queued", "preparing", "ready"])
      .maybeSingle();
    if (orderResult.error) throw orderResult.error;
    if (!orderResult.data) return null;
    const itemsResult = await admin.from("order_items")
      .select("id, product_id, product_name_snapshot, quantity, note, created_at")
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .eq("order_id", id)
      .order("created_at");
    if (itemsResult.error) throw itemsResult.error;
    const items = itemsResult.data ?? [];
    const itemIds = items.map((item) => item.id);
    const productIds = [...new Set(items.map((item) => item.product_id).filter((value): value is string => Boolean(value)))];
    const [modifierResult, routeResult] = await Promise.all([
      itemIds.length ? admin.from("order_item_modifiers")
        .select("order_item_id, group_name_snapshot, modifier_name_snapshot, created_at")
        .eq("organization_id", context.organizationId).eq("store_id", storeId).in("order_item_id", itemIds).order("created_at")
        : Promise.resolve({ data: [], error: null }),
      productIds.length ? admin.from("product_production_stations")
        .select("product_id, station_id")
        .eq("organization_id", context.organizationId).eq("store_id", storeId).in("product_id", productIds)
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
    const order = orderResult.data;
    return {
      id: order.id,
      displayNumber: Number(order.display_number),
      customerName: order.customer_name_snapshot,
      fulfillmentType: order.fulfillment_type,
      productionStatus: order.production_status as KitchenProductionStatus,
      confirmedAt: order.confirmed_at,
      createdAt: order.created_at,
      items: items.map((item) => ({
        id: item.id,
        productId: item.product_id,
        name: item.product_name_snapshot,
        quantity: Number(item.quantity),
        note: item.note,
        stationIds: item.product_id ? stationsByProduct.get(item.product_id) ?? [] : [],
        modifiers: modifiersByItem.get(item.id) ?? [],
      })),
    };
  }
}
