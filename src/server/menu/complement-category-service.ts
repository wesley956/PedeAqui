import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";

export type ComplementCategorySetting = { id: string; name: string; active: boolean; selected: boolean; sortOrder: number; suggestedDefault: boolean };
export type ComplementCategoryRuleSetting = { sourceCategoryId: string; targetCategoryId: string; title: string | null; sortOrder: number };
export type PublicComplementProduct = { id: string; name: string; description: string | null; imageUrl: string | null; priceCents: number; promotionalPriceCents: number | null; requiresConfiguration: boolean };
export type PublicComplementCategory = { id: string; name: string; title: string | null; sourceProductId: string | null; products: PublicComplementProduct[] };

function normalized(value: string) { return value.trim().toLocaleLowerCase("pt-BR"); }

type RuntimeCategoryConfig = { categoryId: string; title: string | null; sortOrder: number };

export class ComplementCategoryService {
  static async loadAdminSettings(): Promise<{ businessType: string; categories: ComplementCategorySetting[]; rules: ComplementCategoryRuleSetting[] }> {
    const context = await authorize(PERMISSIONS.PRODUCTS_VIEW);
    if (!context.storeId) throw new Error("An active store is required");
    const admin = createAdminClient();
    const [{ data: store, error: storeError }, { data: categories, error: categoriesError }, { data: selected, error: selectedError }, { data: rules, error: rulesError }] = await Promise.all([
      admin.from("stores").select("business_type").eq("id", context.storeId).eq("organization_id", context.organizationId).single(),
      admin.from("categories").select("id,name,active,sort_order").eq("organization_id", context.organizationId).eq("store_id", context.storeId).is("deleted_at", null).order("sort_order").order("name"),
      admin.from("store_complement_categories").select("category_id,sort_order").eq("organization_id", context.organizationId).eq("store_id", context.storeId).order("sort_order"),
      admin.from("store_complement_category_rules").select("source_category_id,target_category_id,title,sort_order").eq("organization_id", context.organizationId).eq("store_id", context.storeId).eq("active", true).order("source_category_id").order("sort_order"),
    ]);
    if (storeError) throw storeError;
    if (categoriesError) throw categoriesError;
    if (selectedError) throw selectedError;
    if (rulesError) throw rulesError;
    const selectedMap = new Map((selected ?? []).map((row) => [row.category_id, Number(row.sort_order)]));
    const beverageCandidates = (categories ?? []).filter((category) => category.active && normalized(category.name) === "bebidas");
    const suggestedId = store.business_type === "restaurant" && selectedMap.size === 0 && beverageCandidates.length === 1 ? beverageCandidates[0]!.id : null;
    return {
      businessType: store.business_type ?? "restaurant",
      categories: (categories ?? []).map((category) => ({ id: category.id, name: category.name, active: Boolean(category.active), selected: selectedMap.has(category.id) || category.id === suggestedId, sortOrder: selectedMap.get(category.id) ?? Number(category.sort_order ?? 0), suggestedDefault: category.id === suggestedId })),
      rules: (rules ?? []).map((rule) => ({ sourceCategoryId: rule.source_category_id, targetCategoryId: rule.target_category_id, title: rule.title, sortOrder: Number(rule.sort_order ?? 0) })),
    };
  }

  static async replaceSettings(rows: Array<{ categoryId: string; sortOrder: number }>) {
    const context = await authorize(PERMISSIONS.PRODUCTS_EDIT);
    if (!context.storeId) throw new Error("An active store is required");
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("replace_complement_categories_internal", {
      p_organization_id: context.organizationId,
      p_store_id: context.storeId,
      p_rows: rows.map((row) => ({ category_id: row.categoryId, sort_order: row.sortOrder })),
      p_actor_user_id: context.userId,
    });
    if (error) throw error;
    return Number(data ?? 0);
  }

  static async replaceRules(sourceCategoryId: string, rows: Array<{ targetCategoryId: string; title: string | null; sortOrder: number }>) {
    const context = await authorize(PERMISSIONS.PRODUCTS_EDIT);
    if (!context.storeId) throw new Error("An active store is required");
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("replace_complement_category_rules_internal", {
      p_organization_id: context.organizationId,
      p_store_id: context.storeId,
      p_source_category_id: sourceCategoryId,
      p_rows: rows.map((row) => ({ target_category_id: row.targetCategoryId, title: row.title, sort_order: row.sortOrder })),
      p_actor_user_id: context.userId,
    });
    if (error) throw error;
    return Number(data ?? 0);
  }

  static async loadPublic(storeSlug: string, sourceProductId?: string | null, previewLimit = 4): Promise<PublicComplementCategory[]> {
    const admin = createAdminClient();
    const { data: store, error: storeError } = await admin.from("stores").select("id,organization_id,status,business_type").ilike("slug", storeSlug).in("status", ["active", "temporarily_closed"]).maybeSingle();
    if (storeError) throw storeError;
    if (!store) return [];

    let sourceCategoryId: string | null = null;
    if (sourceProductId) {
      const { data: sourceProduct, error: sourceProductError } = await admin.from("products").select("category_id").eq("id", sourceProductId).eq("organization_id", store.organization_id).eq("store_id", store.id).eq("active", true).is("deleted_at", null).maybeSingle();
      if (sourceProductError) throw sourceProductError;
      sourceCategoryId = sourceProduct?.category_id ?? null;
    }

    let runtimeConfig: RuntimeCategoryConfig[] = [];
    if (sourceCategoryId) {
      const { data: rules, error: rulesError } = await admin.from("store_complement_category_rules")
        .select("target_category_id,title,sort_order")
        .eq("organization_id", store.organization_id)
        .eq("store_id", store.id)
        .eq("source_category_id", sourceCategoryId)
        .eq("active", true)
        .order("sort_order");
      if (rulesError) throw rulesError;
      runtimeConfig = (rules ?? []).map((rule) => ({ categoryId: rule.target_category_id, title: rule.title, sortOrder: Number(rule.sort_order ?? 0) }));
    }

    // Compatibility contract: source-specific rules win. If none exist for the source,
    // retain the legacy/global merchandising configuration exactly as before.
    if (runtimeConfig.length === 0) {
      const { data: settings, error: settingsError } = await admin.from("store_complement_categories").select("category_id,sort_order").eq("organization_id", store.organization_id).eq("store_id", store.id).order("sort_order");
      if (settingsError) throw settingsError;
      runtimeConfig = (settings ?? []).map((row) => ({ categoryId: row.category_id, title: null, sortOrder: Number(row.sort_order ?? 0) }));
    }

    const categoryIds = [...new Set(runtimeConfig.map((row) => row.categoryId))];
    if (categoryIds.length === 0) return [];
    const { data: categories, error: categoriesError } = await admin.from("categories").select("id,name,active,sort_order").eq("organization_id", store.organization_id).eq("store_id", store.id).in("id", categoryIds).is("deleted_at", null);
    if (categoriesError) throw categoriesError;
    const categoryMap = new Map((categories ?? []).filter((category) => category.active).map((category) => [category.id, category]));
    const { data: products, error: productsError } = await admin.from("products").select("id,category_id,name,description,image_url,price_cents,promotional_price_cents,active,availability,sort_order").eq("organization_id", store.organization_id).eq("store_id", store.id).in("category_id", categoryIds).eq("active", true).eq("availability", "available").is("deleted_at", null).order("sort_order").order("name");
    if (productsError) throw productsError;
    const eligibleProducts = (products ?? []).filter((product) => product.id !== sourceProductId);
    const productIds = eligibleProducts.map((product) => product.id);
    const configuredIds = new Set<string>();
    if (productIds.length > 0) {
      const { data: links, error: linksError } = await admin.from("product_modifier_groups").select("product_id").eq("organization_id", store.organization_id).eq("store_id", store.id).in("product_id", productIds);
      if (linksError) throw linksError;
      for (const link of links ?? []) configuredIds.add(link.product_id);
    }

    return runtimeConfig.flatMap((config) => {
      const category = categoryMap.get(config.categoryId);
      if (!category) return [];
      const categoryProducts = eligibleProducts.filter((product) => product.category_id === config.categoryId).slice(0, previewLimit).map((product) => ({ id: product.id, name: product.name, description: product.description, imageUrl: product.image_url, priceCents: Number(product.price_cents), promotionalPriceCents: product.promotional_price_cents === null ? null : Number(product.promotional_price_cents), requiresConfiguration: store.business_type === "gas" || configuredIds.has(product.id) }));
      return categoryProducts.length > 0 ? [{ id: category.id, name: category.name, title: config.title, sourceProductId: sourceProductId ?? null, products: categoryProducts }] : [];
    });
  }
}
