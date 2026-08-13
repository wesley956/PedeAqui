import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize, AuthorizationError } from "@/server/access/authorize";
import { PERMISSIONS, type PermissionKey } from "@/server/access/permissions";
import { parseMoneyToCents } from "@/server/catalog/money";
import { parseInventoryQuantity } from "@/server/inventory/values";

const uuid = z.string().uuid();
function requireStore(storeId: string | null) { if (!storeId) throw new Error("Uma unidade ativa é necessária"); return storeId; }
async function can(permission: PermissionKey, context: Awaited<ReturnType<typeof authorize>>) {
  try { await authorize(permission, context); return true; }
  catch (error) { if (error instanceof AuthorizationError) return false; throw error; }
}
function optionalCost(value?: string | null) { return value?.trim() ? parseMoneyToCents(value) : null; }

export class PurchaseService {
  static async load() {
    const context = await authorize(PERMISSIONS.PURCHASES_VIEW);
    const storeId = requireStore(context.storeId);
    const admin = createAdminClient();
    const [ordersResult, suppliersResult, supplierConfigsResult, catalogResult, inventoryResult, inventoryConfigsResult, balancesResult, canManage, canReceive] = await Promise.all([
      admin.from("purchase_orders").select("id,supplier_id,display_number,status,expected_at,notes,subtotal_cents,sent_at,received_at,cancelled_at,cancelled_reason,created_at").eq("organization_id", context.organizationId).eq("store_id", storeId).order("created_at", { ascending: false }).limit(100),
      admin.from("suppliers").select("id,name").eq("organization_id", context.organizationId).eq("active", true).is("deleted_at", null).order("name"),
      admin.from("supplier_stores").select("supplier_id,active,lead_time_days,minimum_order_cents").eq("organization_id", context.organizationId).eq("store_id", storeId),
      admin.from("supplier_inventory_items").select("supplier_id,inventory_item_id,active,is_preferred,purchase_unit_label,base_units_per_purchase_unit,last_unit_cost_cents").eq("organization_id", context.organizationId).eq("store_id", storeId),
      admin.from("inventory_items").select("id,name,base_unit,active").eq("organization_id", context.organizationId).is("deleted_at", null),
      admin.from("inventory_item_stores").select("inventory_item_id,active,minimum_quantity").eq("organization_id", context.organizationId).eq("store_id", storeId),
      admin.from("inventory_balances").select("inventory_item_id,quantity").eq("organization_id", context.organizationId).eq("store_id", storeId),
      can(PERMISSIONS.PURCHASES_MANAGE, context), can(PERMISSIONS.PURCHASES_RECEIVE, context),
    ]);
    for (const result of [ordersResult, suppliersResult, supplierConfigsResult, catalogResult, inventoryResult, inventoryConfigsResult, balancesResult]) if (result.error) throw result.error;
    const orderIds = (ordersResult.data ?? []).map((row) => row.id);
    const [itemsResult, receiptsResult, historyResult] = orderIds.length ? await Promise.all([
      admin.from("purchase_order_items").select("id,purchase_order_id,inventory_item_id,inventory_name_snapshot,base_unit_snapshot,purchase_unit_label_snapshot,base_units_per_purchase_unit_snapshot,ordered_purchase_quantity,received_purchase_quantity,unit_cost_cents,line_total_cents").eq("organization_id", context.organizationId).eq("store_id", storeId).in("purchase_order_id", orderIds),
      admin.from("purchase_receipts").select("id,purchase_order_id,receipt_kind,reference,notes,corrects_receipt_id,created_at").eq("organization_id", context.organizationId).eq("store_id", storeId).in("purchase_order_id", orderIds).order("created_at", { ascending: false }),
      admin.from("purchase_order_history").select("id,purchase_order_id,from_status,to_status,reason,created_at").eq("organization_id", context.organizationId).eq("store_id", storeId).in("purchase_order_id", orderIds).order("created_at", { ascending: true }),
    ]) : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];
    for (const result of [itemsResult, receiptsResult, historyResult]) if (result.error) throw result.error;
    const receiptIds = (receiptsResult.data ?? []).map((row) => row.id);
    const receiptItemsResult = receiptIds.length ? await admin.from("purchase_receipt_items").select("id,receipt_id,purchase_order_item_id,purchase_quantity_delta,base_quantity_delta,unit_cost_cents,line_total_cents,reason").eq("organization_id", context.organizationId).eq("store_id", storeId).in("receipt_id", receiptIds) : { data: [], error: null };
    if (receiptItemsResult.error) throw receiptItemsResult.error;

    const supplierMap = new Map((suppliersResult.data ?? []).map((supplier) => [supplier.id, supplier]));
    const inventoryMap = new Map((inventoryResult.data ?? []).map((item) => [item.id, item]));
    const orders = (ordersResult.data ?? []).map((order) => ({
      ...order,
      supplier: supplierMap.get(order.supplier_id) ?? null,
      items: (itemsResult.data ?? []).filter((item) => item.purchase_order_id === order.id),
      receipts: (receiptsResult.data ?? []).filter((receipt) => receipt.purchase_order_id === order.id).map((receipt) => ({ ...receipt, items: (receiptItemsResult.data ?? []).filter((item) => item.receipt_id === receipt.id) })),
      history: (historyResult.data ?? []).filter((entry) => entry.purchase_order_id === order.id),
    }));

    const activeSupplierIds = new Set((supplierConfigsResult.data ?? []).filter((row) => row.active).map((row) => row.supplier_id));
    const catalog = (catalogResult.data ?? []).filter((row) => row.active && activeSupplierIds.has(row.supplier_id)).map((row) => ({ ...row, inventory: inventoryMap.get(row.inventory_item_id) ?? null }));
    const configMap = new Map((inventoryConfigsResult.data ?? []).filter((row) => row.active).map((row) => [row.inventory_item_id, row]));
    const balanceMap = new Map((balancesResult.data ?? []).map((row) => [row.inventory_item_id, row]));
    const suggestions = (inventoryResult.data ?? []).flatMap((item) => {
      const config = configMap.get(item.id); if (!config || !item.active) return [];
      const current = Number(balanceMap.get(item.id)?.quantity ?? 0); const minimum = Number(config.minimum_quantity ?? 0);
      if (!Number.isFinite(current) || !Number.isFinite(minimum) || current > minimum) return [];
      const preferred = catalog.find((row) => row.inventory_item_id === item.id && row.is_preferred) ?? catalog.find((row) => row.inventory_item_id === item.id);
      const shortage = Math.max(0, minimum - current); const factor = Number(preferred?.base_units_per_purchase_unit ?? 0);
      const suggestedPurchaseQuantity = factor > 0 ? Math.ceil((shortage / factor) * 1_000_000) / 1_000_000 : null;
      return [{ inventoryItemId: item.id, name: item.name, baseUnit: item.base_unit, current, minimum, shortage, preferredSupplierId: preferred?.supplier_id ?? null, purchaseUnitLabel: preferred?.purchase_unit_label ?? null, suggestedPurchaseQuantity }];
    });
    return { context, storeId, orders, suppliers: suppliersResult.data ?? [], supplierConfigs: supplierConfigsResult.data ?? [], catalog, suggestions, canManage, canReceive };
  }

  private static async scopedOrder(orderId: string, permission: PermissionKey) {
    const context = await authorize(permission); const storeId = requireStore(context.storeId); const id = uuid.parse(orderId); const admin = createAdminClient();
    const { data, error } = await admin.from("purchase_orders").select("id,status").eq("id", id).eq("organization_id", context.organizationId).eq("store_id", storeId).maybeSingle();
    if (error) throw error; if (!data) throw new Error("Pedido de compra fora da unidade ativa"); return { context, storeId, id, admin };
  }

  static async create(input: { supplierId: string; items: Array<{ inventoryItemId: string; quantity: string; unitCostInput?: string | null }>; expectedAt?: string | null; notes?: string | null; idempotencyKey: string }) {
    const context = await authorize(PERMISSIONS.PURCHASES_MANAGE); const storeId = requireStore(context.storeId); const supplierId = uuid.parse(input.supplierId);
    if (input.items.length === 0) throw new Error("Inclua ao menos um item na compra");
    const items = input.items.map((item) => ({ inventory_item_id: uuid.parse(item.inventoryItemId), quantity: parseInventoryQuantity(item.quantity), ...(optionalCost(item.unitCostInput) === null ? {} : { unit_cost_cents: optionalCost(item.unitCostInput) }) }));
    const admin = createAdminClient();
    const { data: supplier, error: supplierError } = await admin.from("supplier_stores").select("supplier_id").eq("organization_id", context.organizationId).eq("store_id", storeId).eq("supplier_id", supplierId).eq("active", true).maybeSingle();
    if (supplierError) throw supplierError; if (!supplier) throw new Error("Fornecedor não está ativo nesta unidade");
    const { data, error } = await admin.rpc("purchase_create_internal", { p_store_id: storeId, p_supplier_id: supplierId, p_items: items, p_expected_at: input.expectedAt || null, p_notes: input.notes?.trim() || null, p_idempotency_key: input.idempotencyKey, p_actor_user_id: context.userId });
    if (error) throw error; return data;
  }

  static async send(orderId: string) { const { context, id, admin } = await this.scopedOrder(orderId, PERMISSIONS.PURCHASES_MANAGE); const { data, error } = await admin.rpc("purchase_send_internal", { p_purchase_order_id: id, p_actor_user_id: context.userId }); if (error) throw error; return data; }
  static async cancel(orderId: string, reason: string) { const { context, id, admin } = await this.scopedOrder(orderId, PERMISSIONS.PURCHASES_MANAGE); const { data, error } = await admin.rpc("purchase_cancel_internal", { p_purchase_order_id: id, p_reason: reason.trim(), p_actor_user_id: context.userId }); if (error) throw error; return data; }

  static async receive(input: { orderId: string; items: Array<{ purchaseOrderItemId: string; quantity: string; unitCostInput?: string | null }>; reference?: string | null; notes?: string | null; idempotencyKey: string }) {
    const { context, id, admin } = await this.scopedOrder(input.orderId, PERMISSIONS.PURCHASES_RECEIVE);
    if (input.items.length === 0) throw new Error("Informe ao menos uma quantidade recebida");
    const items = input.items.map((item) => ({ purchase_order_item_id: uuid.parse(item.purchaseOrderItemId), quantity: parseInventoryQuantity(item.quantity), ...(optionalCost(item.unitCostInput) === null ? {} : { unit_cost_cents: optionalCost(item.unitCostInput) }) }));
    const { data, error } = await admin.rpc("purchase_receive_internal", { p_purchase_order_id: id, p_items: items, p_reference: input.reference?.trim() || null, p_notes: input.notes?.trim() || null, p_idempotency_key: input.idempotencyKey, p_actor_user_id: context.userId });
    if (error) throw error; return data;
  }

  static async correct(input: { orderId: string; receiptId: string; items: Array<{ purchaseOrderItemId: string; quantityDelta: string; unitCostInput?: string | null }>; reason: string; idempotencyKey: string }) {
    const { context, admin } = await this.scopedOrder(input.orderId, PERMISSIONS.PURCHASES_RECEIVE); const receiptId = uuid.parse(input.receiptId);
    if (input.items.length === 0) throw new Error("Informe ao menos uma correção de quantidade");
    const { data: receipt, error: receiptError } = await admin.from("purchase_receipts").select("id").eq("id", receiptId).eq("purchase_order_id", uuid.parse(input.orderId)).eq("organization_id", context.organizationId).eq("receipt_kind", "receipt").maybeSingle();
    if (receiptError) throw receiptError; if (!receipt) throw new Error("Recebimento original não encontrado");
    const items = input.items.map((item) => ({ purchase_order_item_id: uuid.parse(item.purchaseOrderItemId), quantity_delta: parseInventoryQuantity(item.quantityDelta, { allowNegative: true }), ...(optionalCost(item.unitCostInput) === null ? {} : { unit_cost_cents: optionalCost(item.unitCostInput) }) }));
    const { data, error } = await admin.rpc("purchase_receipt_correct_internal", { p_receipt_id: receiptId, p_items: items, p_reason: input.reason.trim(), p_idempotency_key: input.idempotencyKey, p_actor_user_id: context.userId });
    if (error) throw error; return data;
  }
}
