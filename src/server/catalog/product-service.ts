import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { AuditService } from "@/server/audit/audit-service";
import { EventService } from "@/server/events/event-service";
import {
  productAvailabilitySchema,
  productInputSchema,
  uuidSchema,
  type ProductAvailability,
  type ProductInput,
} from "@/server/catalog/schemas";

function requireStoreId(storeId: string | null): string {
  if (!storeId) throw new Error("An active store is required for catalog operations");
  return storeId;
}

export class ProductService {
  static async list() {
    const context = await authorize(PERMISSIONS.PRODUCTS_VIEW);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const { data, error } = await admin.from("products")
      .select("id, category_id, name, description, image_url, price_cents, promotional_price_cents, cost_cents, sku, barcode, preparation_time_minutes, sort_order, active, availability, created_at, updated_at")
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .is("deleted_at", null)
      .order("sort_order").order("name");
    if (error) throw error;
    return data ?? [];
  }

  static async create(input: ProductInput) {
    const values = productInputSchema.parse(input);
    const context = await authorize(PERMISSIONS.PRODUCTS_CREATE);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();

    if (values.categoryId) {
      const { data: category, error } = await admin.from("categories").select("id")
        .eq("id", values.categoryId).eq("organization_id", context.organizationId).eq("store_id", storeId).eq("active", true).is("deleted_at", null).maybeSingle();
      if (error) throw error;
      if (!category) throw new Error("Category does not belong to the active store");
    }

    const active = values.active;
    const availability = active ? values.availability : "inactive";
    const { data, error } = await admin.from("products").insert({
      organization_id: context.organizationId,
      store_id: storeId,
      category_id: values.categoryId ?? null,
      name: values.name,
      description: values.description ?? null,
      image_url: values.imageUrl ?? null,
      price_cents: values.priceCents,
      promotional_price_cents: values.promotionalPriceCents ?? null,
      cost_cents: values.costCents ?? null,
      sku: values.sku ?? null,
      barcode: values.barcode ?? null,
      preparation_time_minutes: values.preparationTimeMinutes,
      sort_order: values.sortOrder,
      active,
      availability,
      created_by: context.userId,
      updated_by: context.userId,
    }).select("id, category_id, name, description, image_url, price_cents, promotional_price_cents, cost_cents, sku, barcode, preparation_time_minutes, sort_order, active, availability").single();
    if (error) throw error;

    await AuditService.record(context, { action: "product.created", entityType: "product", entityId: data.id, after: data });
    await EventService.enqueue(context, { type: "product.created", entityType: "product", entityId: data.id, payload: { name: data.name, price_cents: data.price_cents } });
    return data;
  }

  static async get(productId: string) {
    const id = uuidSchema.parse(productId);
    const context = await authorize(PERMISSIONS.PRODUCTS_VIEW);
    const storeId = requireStoreId(context.storeId);
    const { data, error } = await createAdminClient().from("products")
      .select("id, category_id, name, description, image_url, price_cents, promotional_price_cents, cost_cents, sku, barcode, preparation_time_minutes, sort_order, active, availability")
      .eq("id", id).eq("organization_id", context.organizationId).eq("store_id", storeId)
      .is("deleted_at", null).single();
    if (error) throw error;
    return data;
  }

  static async update(productId: string, input: ProductInput) {
    const id = uuidSchema.parse(productId);
    const values = productInputSchema.parse(input);
    const context = await authorize(PERMISSIONS.PRODUCTS_EDIT);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();

    if (values.categoryId) {
      const { data: category, error } = await admin.from("categories").select("id")
        .eq("id", values.categoryId).eq("organization_id", context.organizationId).eq("store_id", storeId).is("deleted_at", null).maybeSingle();
      if (error) throw error;
      if (!category) throw new Error("Category does not belong to the active store");
    }

    const { data: before, error: beforeError } = await admin.from("products")
      .select("id, category_id, name, description, image_url, price_cents, promotional_price_cents, cost_cents, sku, barcode, preparation_time_minutes, sort_order, active, availability")
      .eq("id", id).eq("organization_id", context.organizationId).eq("store_id", storeId).is("deleted_at", null).single();
    if (beforeError) throw beforeError;

    const patch = {
      category_id: values.categoryId ?? null,
      name: values.name,
      description: values.description ?? null,
      image_url: values.imageUrl ?? null,
      price_cents: values.priceCents,
      promotional_price_cents: values.promotionalPriceCents ?? null,
      cost_cents: values.costCents ?? null,
      sku: values.sku ?? null,
      barcode: values.barcode ?? null,
      preparation_time_minutes: values.preparationTimeMinutes,
      sort_order: values.sortOrder,
      active: values.active,
      availability: values.active ? values.availability : "inactive",
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    };

    const { data: after, error } = await admin.from("products").update(patch)
      .eq("id", id).eq("organization_id", context.organizationId).eq("store_id", storeId)
      .select("id, category_id, name, description, image_url, price_cents, promotional_price_cents, cost_cents, sku, barcode, preparation_time_minutes, sort_order, active, availability").single();
    if (error) throw error;

    await AuditService.record(context, { action: "product.updated", entityType: "product", entityId: id, before, after });
    await EventService.enqueue(context, { type: "product.updated", entityType: "product", entityId: id, payload: { changed_price: before.price_cents !== after.price_cents } });
    return after;
  }

  static async setAvailability(productId: string, requested: ProductAvailability) {
    const id = uuidSchema.parse(productId);
    const availability = productAvailabilitySchema.parse(requested);
    const context = await authorize(PERMISSIONS.PRODUCTS_EDIT);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const { data: before, error: beforeError } = await admin.from("products").select("id, active, availability")
      .eq("id", id).eq("organization_id", context.organizationId).eq("store_id", storeId).is("deleted_at", null).single();
    if (beforeError) throw beforeError;

    const active = availability !== "inactive";
    const { data: after, error } = await admin.from("products")
      .update({ active, availability, updated_by: context.userId, updated_at: new Date().toISOString() })
      .eq("id", id).eq("organization_id", context.organizationId).eq("store_id", storeId)
      .select("id, active, availability").single();
    if (error) throw error;

    await AuditService.record(context, { action: "product.availability_changed", entityType: "product", entityId: id, before, after });
    await EventService.enqueue(context, { type: "product.availability_changed", entityType: "product", entityId: id, payload: { availability } });
    return after;
  }

  static async remove(productId: string) {
    const id = uuidSchema.parse(productId);
    const context = await authorize(PERMISSIONS.PRODUCTS_DELETE);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const { data: before, error: beforeError } = await admin.from("products")
      .select("id, name, active, availability, deleted_at").eq("id", id).eq("organization_id", context.organizationId).eq("store_id", storeId).is("deleted_at", null).single();
    if (beforeError) throw beforeError;
    const deletedAt = new Date().toISOString();
    const { error } = await admin.from("products").update({ active: false, availability: "inactive", deleted_at: deletedAt, updated_by: context.userId, updated_at: deletedAt })
      .eq("id", id).eq("organization_id", context.organizationId).eq("store_id", storeId);
    if (error) throw error;
    await AuditService.record(context, { action: "product.deleted", entityType: "product", entityId: id, before, after: { ...before, active: false, availability: "inactive", deleted_at: deletedAt } });
    await EventService.enqueue(context, { type: "product.deleted", entityType: "product", entityId: id });
  }

  static async duplicate(productId: string) {
    const id = uuidSchema.parse(productId);
    const context = await authorize(PERMISSIONS.PRODUCTS_CREATE);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const { data: source, error: sourceError } = await admin.from("products")
      .select("category_id, name, description, image_url, price_cents, promotional_price_cents, cost_cents, sku, barcode, preparation_time_minutes, sort_order, active, availability")
      .eq("id", id).eq("organization_id", context.organizationId).eq("store_id", storeId).is("deleted_at", null).single();
    if (sourceError) throw sourceError;

    const { data: copy, error: copyError } = await admin.from("products").insert({
      ...source,
      organization_id: context.organizationId,
      store_id: storeId,
      name: `${source.name} — Cópia`,
      sku: null,
      barcode: null,
      created_by: context.userId,
      updated_by: context.userId,
    }).select("id, name, price_cents, availability").single();
    if (copyError) throw copyError;

    const { data: links, error: linksError } = await admin.from("product_modifier_groups")
      .select("modifier_group_id, sort_order").eq("product_id", id).eq("organization_id", context.organizationId).eq("store_id", storeId);
    if (linksError) {
      await admin.from("products").delete().eq("id", copy.id).eq("organization_id", context.organizationId).eq("store_id", storeId);
      throw linksError;
    }
    if (links?.length) {
      const { error } = await admin.from("product_modifier_groups").insert(links.map((link) => ({
        organization_id: context.organizationId,
        store_id: storeId,
        product_id: copy.id,
        modifier_group_id: link.modifier_group_id,
        sort_order: link.sort_order,
      })));
      if (error) {
        await admin.from("products").delete().eq("id", copy.id).eq("organization_id", context.organizationId).eq("store_id", storeId);
        throw error;
      }
    }

    await AuditService.record(context, { action: "product.duplicated", entityType: "product", entityId: copy.id, after: { sourceProductId: id, ...copy } });
    await EventService.enqueue(context, { type: "product.duplicated", entityType: "product", entityId: copy.id, payload: { source_product_id: id } });
    return copy;
  }
}
