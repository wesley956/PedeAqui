import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize, AuthorizationError } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { parseInventoryQuantity } from "@/server/inventory/values";

const uuid = z.string().uuid();
const targetType = z.enum(["product", "modifier"]);

function requireStore(storeId: string | null) {
  if (!storeId) throw new Error("Uma unidade ativa é necessária");
  return storeId;
}
async function canManage(context: Awaited<ReturnType<typeof authorize>>) {
  try { await authorize(PERMISSIONS.RECIPES_MANAGE, context); return true; }
  catch (error) { if (error instanceof AuthorizationError) return false; throw error; }
}

export class RecipeService {
  static async load() {
    const context = await authorize(PERMISSIONS.RECIPES_VIEW);
    const storeId = requireStore(context.storeId);
    const admin = createAdminClient();
    const [productsResult, groupsResult, modifiersResult, itemsResult, configsResult, recipesResult, recipeItemsResult, canEdit] = await Promise.all([
      admin.from("products").select("id,name").eq("organization_id", context.organizationId).eq("store_id", storeId).eq("active", true).is("deleted_at", null).order("name"),
      admin.from("modifier_groups").select("id,name").eq("organization_id", context.organizationId).eq("store_id", storeId).eq("active", true).is("deleted_at", null),
      admin.from("modifiers").select("id,modifier_group_id,name").eq("organization_id", context.organizationId).eq("store_id", storeId).eq("active", true).is("deleted_at", null).order("name"),
      admin.from("inventory_items").select("id,name,base_unit").eq("organization_id", context.organizationId).eq("active", true).is("deleted_at", null).order("name"),
      admin.from("inventory_item_stores").select("inventory_item_id,active,average_cost_micros_per_base_unit").eq("organization_id", context.organizationId).eq("store_id", storeId).eq("active", true),
      admin.from("recipes").select("id,target_type,product_id,modifier_id,version,effective_at,notes,created_at").eq("organization_id", context.organizationId).eq("store_id", storeId).order("effective_at", { ascending: false }).order("version", { ascending: false }),
      admin.from("recipe_items").select("recipe_id,inventory_item_id,quantity").eq("organization_id", context.organizationId).eq("store_id", storeId),
      canManage(context),
    ]);
    for (const result of [productsResult, groupsResult, modifiersResult, itemsResult, configsResult, recipesResult, recipeItemsResult]) if (result.error) throw result.error;
    const configMap = new Map((configsResult.data ?? []).map((row) => [row.inventory_item_id, row]));
    const inventoryItems = (itemsResult.data ?? []).filter((item) => configMap.has(item.id)).map((item) => ({ ...item, averageCostMicros: Number(configMap.get(item.id)?.average_cost_micros_per_base_unit ?? 0) }));
    const itemMap = new Map(inventoryItems.map((item) => [item.id, item]));
    const itemsByRecipe = new Map<string, Array<{ inventoryItemId: string; name: string; baseUnit: string; quantity: string; averageCostMicros: number }>>();
    for (const row of recipeItemsResult.data ?? []) {
      const item = itemMap.get(row.inventory_item_id);
      if (!item) continue;
      const list = itemsByRecipe.get(row.recipe_id) ?? [];
      list.push({ inventoryItemId: row.inventory_item_id, name: item.name, baseUnit: item.base_unit, quantity: String(row.quantity), averageCostMicros: item.averageCostMicros });
      itemsByRecipe.set(row.recipe_id, list);
    }
    const groupMap = new Map((groupsResult.data ?? []).map((row) => [row.id, row.name]));
    const modifierMap = new Map((modifiersResult.data ?? []).map((row) => [row.id, `${groupMap.get(row.modifier_group_id) ?? "Adicional"} · ${row.name}`]));
    const productMap = new Map((productsResult.data ?? []).map((row) => [row.id, row.name]));
    const recipes = (recipesResult.data ?? []).map((recipe) => {
      const items = itemsByRecipe.get(recipe.id) ?? [];
      const estimatedCostCents = Math.round(items.reduce((sum, item) => sum + Number(item.quantity) * item.averageCostMicros, 0) / 1_000_000);
      return { ...recipe, targetName: recipe.target_type === "product" ? productMap.get(recipe.product_id ?? "") ?? "Produto removido" : modifierMap.get(recipe.modifier_id ?? "") ?? "Adicional removido", items, estimatedCostCents };
    });
    return { context, storeId, canManage: canEdit, products: productsResult.data ?? [], modifiers: (modifiersResult.data ?? []).map((row) => ({ ...row, label: modifierMap.get(row.id) ?? row.name })), inventoryItems, recipes };
  }

  static async createVersion(input: { targetType: string; targetId: string; items: Array<{ inventoryItemId: string; quantity: string }>; notes?: string | null; effectiveAt?: string | null }) {
    const context = await authorize(PERMISSIONS.RECIPES_MANAGE);
    const storeId = requireStore(context.storeId);
    const type = targetType.parse(input.targetType);
    const targetId = uuid.parse(input.targetId);
    if (input.items.length === 0) throw new Error("Adicione pelo menos um insumo à ficha técnica");
    const normalizedItems = input.items.map((item) => ({ inventory_item_id: uuid.parse(item.inventoryItemId), quantity: parseInventoryQuantity(item.quantity) }));
    const admin = createAdminClient();
    const targetResult = type === "product"
      ? await admin.from("products").select("id").eq("id", targetId).eq("organization_id", context.organizationId).eq("store_id", storeId).is("deleted_at", null).maybeSingle()
      : await admin.from("modifiers").select("id").eq("id", targetId).eq("organization_id", context.organizationId).eq("store_id", storeId).is("deleted_at", null).maybeSingle();
    if (targetResult.error) throw targetResult.error;
    if (!targetResult.data) throw new Error("Produto/adicional fora da unidade ativa");
    const ids = [...new Set(normalizedItems.map((item) => item.inventory_item_id))];
    if (ids.length !== normalizedItems.length) throw new Error("Não repita o mesmo insumo na ficha técnica");
    const { data: scopedItems, error: scopedError } = await admin.from("inventory_item_stores").select("inventory_item_id").eq("organization_id", context.organizationId).eq("store_id", storeId).eq("active", true).in("inventory_item_id", ids);
    if (scopedError) throw scopedError;
    if ((scopedItems ?? []).length !== ids.length) throw new Error("Todos os insumos precisam estar ativos nesta unidade");
    const effectiveAt = input.effectiveAt?.trim() ? new Date(input.effectiveAt) : new Date();
    if (Number.isNaN(effectiveAt.getTime())) throw new Error("Data de vigência inválida");
    const { data, error } = await admin.rpc("recipe_create_version_internal", {
      p_store_id: storeId, p_target_type: type, p_target_id: targetId, p_items: normalizedItems,
      p_effective_at: effectiveAt.toISOString(), p_notes: input.notes?.trim() || null, p_actor_user_id: context.userId,
    });
    if (error) throw error;
    return data;
  }
}
