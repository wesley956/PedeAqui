import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { PosCategory, PosModifierGroup, PosProduct } from "@/features/pdv/model";

export async function loadDiningCatalog(organizationId: string, storeId: string) {
  const admin = createAdminClient();
  const [categoriesResult, productsResult, linksResult, groupsResult, modifiersResult] = await Promise.all([
    admin.from("categories").select("id, name, sort_order")
      .eq("organization_id", organizationId).eq("store_id", storeId)
      .eq("active", true).is("deleted_at", null).order("sort_order").order("name"),
    admin.from("products").select("id, category_id, name, description, sku, barcode, price_cents, promotional_price_cents")
      .eq("organization_id", organizationId).eq("store_id", storeId)
      .eq("active", true).eq("availability", "available").is("deleted_at", null).order("name"),
    admin.from("product_modifier_groups").select("product_id, modifier_group_id, sort_order")
      .eq("organization_id", organizationId).eq("store_id", storeId).order("sort_order"),
    admin.from("modifier_groups").select("id, name, min_selection, max_selection, required, sort_order")
      .eq("organization_id", organizationId).eq("store_id", storeId)
      .eq("active", true).is("deleted_at", null).order("sort_order"),
    admin.from("modifiers").select("id, modifier_group_id, name, price_cents, sort_order")
      .eq("organization_id", organizationId).eq("store_id", storeId)
      .eq("active", true).is("deleted_at", null).order("sort_order"),
  ]);
  for (const result of [categoriesResult, productsResult, linksResult, groupsResult, modifiersResult]) {
    if (result.error) throw result.error;
  }

  const categories: PosCategory[] = (categoriesResult.data ?? []).map((row) => ({
    id: row.id, name: row.name, sortOrder: Number(row.sort_order),
  }));
  const activeCategoryIds = new Set(categories.map((category) => category.id));
  const modifiersByGroup = new Map<string, Array<{ id: string; name: string; priceCents: number; sortOrder: number }>>();
  for (const row of modifiersResult.data ?? []) {
    const list = modifiersByGroup.get(row.modifier_group_id) ?? [];
    list.push({ id: row.id, name: row.name, priceCents: Number(row.price_cents), sortOrder: Number(row.sort_order) });
    modifiersByGroup.set(row.modifier_group_id, list);
  }
  const groupsById = new Map<string, PosModifierGroup>();
  for (const row of groupsResult.data ?? []) {
    groupsById.set(row.id, {
      id: row.id,
      name: row.name,
      minSelection: Number(row.min_selection),
      maxSelection: Number(row.max_selection),
      required: Boolean(row.required),
      sortOrder: Number(row.sort_order),
      modifiers: (modifiersByGroup.get(row.id) ?? [])
        .toSorted((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "pt-BR"))
        .map(({ id, name, priceCents }) => ({ id, name, priceCents })),
    });
  }
  const groupIdsByProduct = new Map<string, string[]>();
  for (const row of linksResult.data ?? []) {
    if (!groupsById.has(row.modifier_group_id)) continue;
    const list = groupIdsByProduct.get(row.product_id) ?? [];
    list.push(row.modifier_group_id);
    groupIdsByProduct.set(row.product_id, list);
  }
  const products: PosProduct[] = (productsResult.data ?? [])
    .filter((row) => row.category_id === null || activeCategoryIds.has(row.category_id))
    .map((row) => ({
      id: row.id,
      categoryId: row.category_id,
      name: row.name,
      description: row.description,
      sku: row.sku,
      barcode: row.barcode,
      priceCents: Number(row.promotional_price_cents ?? row.price_cents),
      modifierGroups: (groupIdsByProduct.get(row.id) ?? [])
        .map((groupId) => groupsById.get(groupId))
        .filter((group): group is PosModifierGroup => Boolean(group)),
    }));
  return { categories, products };
}
