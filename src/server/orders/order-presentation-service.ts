import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import type { OrderItemPreview, OrderManagerRow } from "@/features/orders/manager-model";
import { sanitizeExternalOrderPresentation } from "@/features/orders/external-order-presentation";

const managerSelect = "id, display_number, channel, fulfillment_type, order_status, payment_status, payment_method_snapshot, production_status, fulfillment_status, customer_name_snapshot, total_cents, scheduled_for, created_at, updated_at";
const externalSelect = "order_id, provider, external_order_id, payment_owner, logistics_owner, sync_status, last_snapshot";
const externalBatchSize = 100;

function requireStoreId(storeId: string | null) {
  if (!storeId) throw new Error("An active store is required");
  return storeId;
}

function chunks<T>(values: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

export class OrderPresentationService {
  static async enrichRows(rows: OrderManagerRow[]) {
    if (rows.length === 0) return rows;

    const context = await authorize(PERMISSIONS.ORDERS_VIEW);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const orderIds = [...new Set(rows.map((row) => row.id))];
    const externalRows: Array<Record<string, unknown>> = [];

    for (const batch of chunks(orderIds, externalBatchSize)) {
      const { data, error } = await admin.from("external_orders")
        .select(externalSelect)
        .eq("organization_id", context.organizationId)
        .eq("store_id", storeId)
        .in("order_id", batch);
      if (error) throw error;
      externalRows.push(...(data ?? []));
    }

    const externalByOrderId = new Map<string, ReturnType<typeof sanitizeExternalOrderPresentation>>();
    for (const row of externalRows) {
      const orderId = typeof row.order_id === "string" ? row.order_id : null;
      if (!orderId) continue;
      const external = sanitizeExternalOrderPresentation({
        provider: typeof row.provider === "string" ? row.provider : "",
        external_order_id: typeof row.external_order_id === "string" ? row.external_order_id : "",
        payment_owner: typeof row.payment_owner === "string" ? row.payment_owner : "",
        logistics_owner: typeof row.logistics_owner === "string" ? row.logistics_owner : null,
        sync_status: typeof row.sync_status === "string" ? row.sync_status : "attention",
        last_snapshot: row.last_snapshot,
      });
      externalByOrderId.set(orderId, external);
    }

    const itemsByOrderId = await this.loadItemPreviews(admin, context.organizationId, storeId, orderIds);
    return rows.map((row) => ({ ...row, external: externalByOrderId.get(row.id) ?? null, items_preview: itemsByOrderId.get(row.id) ?? [] }));
  }

  /** Itens e opções de cada pedido, em lotes, para a lista compacta do celular. */
  private static async loadItemPreviews(admin: ReturnType<typeof createAdminClient>, organizationId: string, storeId: string, orderIds: string[]) {
    const items: Array<{ id: string; order_id: string; product_name_snapshot: string; quantity: number; note: string | null }> = [];
    for (const batch of chunks(orderIds, externalBatchSize)) {
      const { data, error } = await admin.from("order_items")
        .select("id, order_id, product_name_snapshot, quantity, note")
        .eq("organization_id", organizationId)
        .eq("store_id", storeId)
        .in("order_id", batch)
        .order("created_at");
      if (error) throw error;
      items.push(...((data ?? []) as typeof items));
    }
    const optionsByItem = new Map<string, string[]>();
    for (const batch of chunks(items.map((item) => item.id), externalBatchSize)) {
      const { data, error } = await admin.from("order_item_modifiers")
        .select("order_item_id, modifier_name_snapshot, quantity")
        .eq("organization_id", organizationId)
        .eq("store_id", storeId)
        .in("order_item_id", batch)
        .order("created_at");
      if (error) throw error;
      for (const row of (data ?? []) as Array<{ order_item_id: string; modifier_name_snapshot: string; quantity: number | null }>) {
        const label = row.quantity && row.quantity > 1 ? `${row.modifier_name_snapshot} ${row.quantity}` : row.modifier_name_snapshot;
        optionsByItem.set(row.order_item_id, [...(optionsByItem.get(row.order_item_id) ?? []), label]);
      }
    }
    const byOrder = new Map<string, OrderItemPreview[]>();
    for (const item of items) {
      const preview: OrderItemPreview = { name: item.product_name_snapshot, quantity: item.quantity, options: optionsByItem.get(item.id) ?? [], note: item.note };
      byOrder.set(item.order_id, [...(byOrder.get(item.order_id) ?? []), preview]);
    }
    return byOrder;
  }

  static async getManagerRow(orderId: string): Promise<OrderManagerRow | null> {
    const context = await authorize(PERMISSIONS.ORDERS_VIEW);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const { data, error } = await admin.from("orders")
      .select(managerSelect)
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .eq("id", orderId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    const [enriched] = await this.enrichRows([data as OrderManagerRow]);
    return enriched ?? null;
  }
}
