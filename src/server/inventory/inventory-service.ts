import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize, AuthorizationError } from "@/server/access/authorize";
import { PERMISSIONS, type PermissionKey } from "@/server/access/permissions";
import { costInputToMicrosPerBaseUnit, parseInventoryQuantity, type InventoryBaseUnit } from "@/server/inventory/values";

const uuid = z.string().uuid();
const baseUnit = z.enum(["unit", "g", "ml"]);
const manualType = z.enum(["purchase", "return", "loss", "adjustment", "production"]);

function requireStore(storeId: string | null) {
  if (!storeId) throw new Error("Uma unidade ativa é necessária");
  return storeId;
}
async function can(permission: PermissionKey, context: Awaited<ReturnType<typeof authorize>>) {
  try { await authorize(permission, context); return true; }
  catch (error) { if (error instanceof AuthorizationError) return false; throw error; }
}

export class InventoryService {
  static async load() {
    const context = await authorize(PERMISSIONS.INVENTORY_VIEW);
    const storeId = requireStore(context.storeId);
    const admin = createAdminClient();
    const [configsResult, allItemsResult, balancesResult, movementsResult, storesResult, canManage, canAdjust] = await Promise.all([
      admin.from("inventory_item_stores").select("inventory_item_id,active,minimum_quantity,allow_negative,average_cost_micros_per_base_unit,updated_at")
        .eq("organization_id", context.organizationId).eq("store_id", storeId),
      admin.from("inventory_items").select("id,name,sku,base_unit,active,created_at")
        .eq("organization_id", context.organizationId).is("deleted_at", null).order("name"),
      admin.from("inventory_balances").select("inventory_item_id,quantity,updated_at")
        .eq("organization_id", context.organizationId).eq("store_id", storeId),
      admin.from("inventory_movements").select("id,inventory_item_id,movement_type,quantity_delta,unit_cost_micros,idempotency_key,source_type,order_id,transfer_group_id,reason,created_at")
        .eq("organization_id", context.organizationId).eq("store_id", storeId).order("created_at", { ascending: false }).limit(120),
      admin.from("stores").select("id,name").eq("organization_id", context.organizationId).eq("status", "active").order("name"),
      can(PERMISSIONS.INVENTORY_MANAGE, context),
      can(PERMISSIONS.INVENTORY_ADJUST, context),
    ]);
    for (const result of [configsResult, allItemsResult, balancesResult, movementsResult, storesResult]) if (result.error) throw result.error;
    const configMap = new Map((configsResult.data ?? []).map((row) => [row.inventory_item_id, row]));
    const balanceMap = new Map((balancesResult.data ?? []).map((row) => [row.inventory_item_id, row]));
    const items = (allItemsResult.data ?? []).map((item) => ({ ...item, config: configMap.get(item.id) ?? null, balance: balanceMap.get(item.id) ?? null }));
    return { context, storeId, items, movements: movementsResult.data ?? [], stores: storesResult.data ?? [], canManage, canAdjust };
  }

  static async createItem(input: { name: string; sku?: string | null; baseUnit: InventoryBaseUnit; minimumQuantity: string; allowNegative: boolean; costInput?: string }) {
    const context = await authorize(PERMISSIONS.INVENTORY_MANAGE);
    const storeId = requireStore(context.storeId);
    const unit = baseUnit.parse(input.baseUnit);
    const minimum = parseInventoryQuantity(input.minimumQuantity, { allowZero: true });
    const costMicros = costInputToMicrosPerBaseUnit(input.costInput ?? "", unit);
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("inventory_create_item_internal", {
      p_store_id: storeId, p_name: input.name.trim(), p_sku: input.sku?.trim() || null, p_base_unit: unit,
      p_minimum_quantity: minimum, p_allow_negative: input.allowNegative, p_average_cost_micros: costMicros,
      p_actor_user_id: context.userId,
    });
    if (error) throw error;
    return data;
  }

  static async enableItem(inventoryItemId: string, minimumQuantity: string, allowNegative: boolean) {
    const context = await authorize(PERMISSIONS.INVENTORY_MANAGE);
    const storeId = requireStore(context.storeId);
    const itemId = uuid.parse(inventoryItemId);
    const minimum = parseInventoryQuantity(minimumQuantity, { allowZero: true });
    const admin = createAdminClient();
    const { data: item, error: itemError } = await admin.from("inventory_items").select("id").eq("id", itemId).eq("organization_id", context.organizationId).is("deleted_at", null).maybeSingle();
    if (itemError) throw itemError;
    if (!item) throw new Error("Insumo não encontrado na organização");
    const { data, error } = await admin.rpc("inventory_enable_item_store_internal", { p_store_id: storeId, p_inventory_item_id: itemId, p_minimum_quantity: minimum, p_allow_negative: allowNegative, p_actor_user_id: context.userId });
    if (error) throw error;
    return data;
  }

  static async updateStoreItem(input: { inventoryItemId: string; active: boolean; minimumQuantity: string; allowNegative: boolean; costInput?: string; baseUnit: InventoryBaseUnit }) {
    const context = await authorize(PERMISSIONS.INVENTORY_MANAGE);
    const storeId = requireStore(context.storeId);
    const itemId = uuid.parse(input.inventoryItemId);
    const unit = baseUnit.parse(input.baseUnit);
    const minimum = parseInventoryQuantity(input.minimumQuantity, { allowZero: true });
    const costMicros = costInputToMicrosPerBaseUnit(input.costInput ?? "", unit);
    const admin = createAdminClient();
    const { data: scoped, error: scopedError } = await admin.from("inventory_item_stores").select("inventory_item_id").eq("organization_id", context.organizationId).eq("store_id", storeId).eq("inventory_item_id", itemId).maybeSingle();
    if (scopedError) throw scopedError;
    if (!scoped) throw new Error("Insumo não configurado nesta unidade");
    const { data, error } = await admin.rpc("inventory_update_store_item_internal", { p_store_id: storeId, p_inventory_item_id: itemId, p_active: input.active, p_minimum_quantity: minimum, p_allow_negative: input.allowNegative, p_average_cost_micros: costMicros, p_actor_user_id: context.userId });
    if (error) throw error;
    return data;
  }

  static async manualMovement(input: { inventoryItemId: string; movementType: string; quantity: string; costInput?: string; baseUnit: InventoryBaseUnit; reason?: string | null; idempotencyKey?: string }) {
    const context = await authorize(PERMISSIONS.INVENTORY_ADJUST);
    const storeId = requireStore(context.storeId);
    const itemId = uuid.parse(input.inventoryItemId);
    const type = manualType.parse(input.movementType);
    const quantity = parseInventoryQuantity(input.quantity, { allowNegative: type === "adjustment" });
    const costMicros = costInputToMicrosPerBaseUnit(input.costInput ?? "", baseUnit.parse(input.baseUnit));
    const admin = createAdminClient();
    const { data: scoped, error: scopedError } = await admin.from("inventory_item_stores").select("inventory_item_id").eq("organization_id", context.organizationId).eq("store_id", storeId).eq("inventory_item_id", itemId).maybeSingle();
    if (scopedError) throw scopedError;
    if (!scoped) throw new Error("Insumo fora da unidade ativa");
    const { data, error } = await admin.rpc("inventory_manual_movement_internal", {
      p_store_id: storeId, p_inventory_item_id: itemId, p_movement_type: type, p_quantity: quantity,
      p_unit_cost_micros: costMicros, p_reason: input.reason?.trim() || null, p_idempotency_key: input.idempotencyKey ?? randomUUID(), p_actor_user_id: context.userId,
    });
    if (error) throw error;
    return data;
  }

  static async transfer(input: { targetStoreId: string; inventoryItemId: string; quantity: string; reason: string; idempotencyKey?: string }) {
    const context = await authorize(PERMISSIONS.INVENTORY_ADJUST);
    const sourceStoreId = requireStore(context.storeId);
    const targetStoreId = uuid.parse(input.targetStoreId);
    const itemId = uuid.parse(input.inventoryItemId);
    const quantity = parseInventoryQuantity(input.quantity);
    const admin = createAdminClient();
    const [targetResult, sourceConfig, targetConfig] = await Promise.all([
      admin.from("stores").select("id").eq("id", targetStoreId).eq("organization_id", context.organizationId).eq("status", "active").maybeSingle(),
      admin.from("inventory_item_stores").select("inventory_item_id").eq("organization_id", context.organizationId).eq("store_id", sourceStoreId).eq("inventory_item_id", itemId).eq("active", true).maybeSingle(),
      admin.from("inventory_item_stores").select("inventory_item_id").eq("organization_id", context.organizationId).eq("store_id", targetStoreId).eq("inventory_item_id", itemId).eq("active", true).maybeSingle(),
    ]);
    for (const result of [targetResult, sourceConfig, targetConfig]) if (result.error) throw result.error;
    if (!targetResult.data || !sourceConfig.data || !targetConfig.data) throw new Error("O insumo precisa estar ativo nas duas unidades");
    const { data, error } = await admin.rpc("inventory_transfer_internal", { p_source_store_id: sourceStoreId, p_target_store_id: targetStoreId, p_inventory_item_id: itemId, p_quantity: quantity, p_reason: input.reason.trim(), p_idempotency_key: input.idempotencyKey ?? randomUUID(), p_actor_user_id: context.userId });
    if (error) throw error;
    return data;
  }

  static async reconcile(input: { inventoryItemId: string; countedQuantity: string; reason: string; idempotencyKey?: string }) {
    const context = await authorize(PERMISSIONS.INVENTORY_ADJUST);
    const storeId = requireStore(context.storeId);
    const itemId = uuid.parse(input.inventoryItemId);
    const counted = parseInventoryQuantity(input.countedQuantity, { allowZero: true });
    const admin = createAdminClient();
    const { data: scoped, error: scopedError } = await admin.from("inventory_item_stores").select("inventory_item_id").eq("organization_id", context.organizationId).eq("store_id", storeId).eq("inventory_item_id", itemId).maybeSingle();
    if (scopedError) throw scopedError;
    if (!scoped) throw new Error("Insumo fora da unidade ativa");
    const { data, error } = await admin.rpc("inventory_reconcile_internal", { p_store_id: storeId, p_inventory_item_id: itemId, p_counted_quantity: counted, p_reason: input.reason.trim(), p_idempotency_key: input.idempotencyKey ?? randomUUID(), p_actor_user_id: context.userId });
    if (error) throw error;
    return data;
  }
}
