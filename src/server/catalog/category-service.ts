import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { AuditService } from "@/server/audit/audit-service";
import { EventService } from "@/server/events/event-service";
import { categoryInputSchema, uuidSchema, type CategoryInput } from "@/server/catalog/schemas";

function requireStoreId(storeId: string | null): string {
  if (!storeId) throw new Error("An active store is required for catalog operations");
  return storeId;
}

export class CategoryService {
  static async list() {
    const context = await authorize(PERMISSIONS.PRODUCTS_VIEW);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("categories")
      .select("id, name, description, image_url, sort_order, active, created_at, updated_at")
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .is("deleted_at", null)
      .order("sort_order")
      .order("name");

    if (error) throw error;
    return data ?? [];
  }

  static async create(input: CategoryInput) {
    const values = categoryInputSchema.parse(input);
    const context = await authorize(PERMISSIONS.PRODUCTS_CREATE);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("categories")
      .insert({
        organization_id: context.organizationId,
        store_id: storeId,
        name: values.name,
        description: values.description ?? null,
        image_url: values.imageUrl ?? null,
        sort_order: values.sortOrder,
        active: values.active,
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("id, name, description, image_url, sort_order, active")
      .single();

    if (error) throw error;
    await AuditService.record(context, { action: "category.created", entityType: "category", entityId: data.id, after: data });
    await EventService.enqueue(context, { type: "category.created", entityType: "category", entityId: data.id, payload: { name: data.name } });
    return data;
  }

  static async get(categoryId: string) {
    const id = uuidSchema.parse(categoryId);
    const context = await authorize(PERMISSIONS.PRODUCTS_VIEW);
    const storeId = requireStoreId(context.storeId);
    const { data, error } = await createAdminClient().from("categories")
      .select("id, name, description, image_url, sort_order, active")
      .eq("id", id).eq("organization_id", context.organizationId).eq("store_id", storeId)
      .is("deleted_at", null).single();
    if (error) throw error;
    return data;
  }

  static async update(categoryId: string, input: CategoryInput) {
    const id = uuidSchema.parse(categoryId);
    const values = categoryInputSchema.parse(input);
    const context = await authorize(PERMISSIONS.PRODUCTS_EDIT);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();

    const { data: before, error: beforeError } = await admin.from("categories")
      .select("id, name, description, image_url, sort_order, active")
      .eq("id", id).eq("organization_id", context.organizationId).eq("store_id", storeId).is("deleted_at", null).single();
    if (beforeError) throw beforeError;

    const patch = {
      name: values.name,
      description: values.description ?? null,
      image_url: values.imageUrl ?? null,
      sort_order: values.sortOrder,
      active: values.active,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    };
    const { data: after, error } = await admin.from("categories").update(patch)
      .eq("id", id).eq("organization_id", context.organizationId).eq("store_id", storeId)
      .select("id, name, description, image_url, sort_order, active").single();
    if (error) throw error;

    await AuditService.record(context, { action: "category.updated", entityType: "category", entityId: id, before, after });
    await EventService.enqueue(context, { type: "category.updated", entityType: "category", entityId: id, payload: { name: after.name } });
    return after;
  }

  static async setActive(categoryId: string, active: boolean) {
    const id = uuidSchema.parse(categoryId);
    const context = await authorize(PERMISSIONS.PRODUCTS_EDIT);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const { data: before, error: beforeError } = await admin.from("categories").select("id, active")
      .eq("id", id).eq("organization_id", context.organizationId).eq("store_id", storeId).is("deleted_at", null).single();
    if (beforeError) throw beforeError;
    const { data: after, error } = await admin.from("categories")
      .update({ active, updated_by: context.userId, updated_at: new Date().toISOString() })
      .eq("id", id).eq("organization_id", context.organizationId).eq("store_id", storeId)
      .select("id, active").single();
    if (error) throw error;
    await AuditService.record(context, { action: "category.availability_changed", entityType: "category", entityId: id, before, after });
    return after;
  }

  static async remove(categoryId: string) {
    const id = uuidSchema.parse(categoryId);
    const context = await authorize(PERMISSIONS.PRODUCTS_DELETE);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const { data: before, error: beforeError } = await admin.from("categories")
      .select("id, name, active, deleted_at").eq("id", id).eq("organization_id", context.organizationId).eq("store_id", storeId).is("deleted_at", null).single();
    if (beforeError) throw beforeError;
    const deletedAt = new Date().toISOString();
    const { error } = await admin.from("categories")
      .update({ active: false, deleted_at: deletedAt, updated_by: context.userId, updated_at: deletedAt })
      .eq("id", id).eq("organization_id", context.organizationId).eq("store_id", storeId);
    if (error) throw error;
    await AuditService.record(context, { action: "category.deleted", entityType: "category", entityId: id, before, after: { ...before, active: false, deleted_at: deletedAt } });
    await EventService.enqueue(context, { type: "category.deleted", entityType: "category", entityId: id });
  }
}
