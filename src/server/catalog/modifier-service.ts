import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { AuditService } from "@/server/audit/audit-service";
import { EventService } from "@/server/events/event-service";
import {
  modifierGroupInputSchema,
  modifierInputSchema,
  productModifierGroupLinkSchema,
  uuidSchema,
  type ModifierGroupInput,
  type ModifierInput,
} from "@/server/catalog/schemas";

function requireStoreId(storeId: string | null): string {
  if (!storeId) throw new Error("An active store is required for catalog operations");
  return storeId;
}

export class ModifierService {
  static async listGroups() {
    const context = await authorize(PERMISSIONS.PRODUCTS_VIEW);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const { data, error } = await admin.from("modifier_groups")
      .select("id, name, description, min_selection, max_selection, required, sort_order, active, created_at, updated_at")
      .eq("organization_id", context.organizationId).eq("store_id", storeId).is("deleted_at", null)
      .order("sort_order").order("name");
    if (error) throw error;
    return data ?? [];
  }

  static async listModifiers(groupId?: string) {
    const context = await authorize(PERMISSIONS.PRODUCTS_VIEW);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    let query = admin.from("modifiers")
      .select("id, modifier_group_id, name, price_cents, sort_order, active, created_at, updated_at")
      .eq("organization_id", context.organizationId).eq("store_id", storeId).is("deleted_at", null);
    if (groupId) query = query.eq("modifier_group_id", uuidSchema.parse(groupId));
    const { data, error } = await query.order("sort_order").order("name");
    if (error) throw error;
    return data ?? [];
  }

  static async createGroup(input: ModifierGroupInput) {
    const values = modifierGroupInputSchema.parse(input);
    const context = await authorize(PERMISSIONS.PRODUCTS_CREATE);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const { data, error } = await admin.from("modifier_groups").insert({
      organization_id: context.organizationId,
      store_id: storeId,
      name: values.name,
      description: values.description ?? null,
      min_selection: values.minSelection,
      max_selection: values.maxSelection,
      required: values.required,
      sort_order: values.sortOrder,
      active: values.active,
      created_by: context.userId,
      updated_by: context.userId,
    }).select("id, name, min_selection, max_selection, required, sort_order, active").single();
    if (error) throw error;
    await AuditService.record(context, { action: "modifier_group.created", entityType: "modifier_group", entityId: data.id, after: data });
    await EventService.enqueue(context, { type: "modifier_group.created", entityType: "modifier_group", entityId: data.id, payload: { name: data.name } });
    return data;
  }

  static async updateGroup(groupId: string, input: ModifierGroupInput) {
    const id = uuidSchema.parse(groupId);
    const values = modifierGroupInputSchema.parse(input);
    const context = await authorize(PERMISSIONS.PRODUCTS_EDIT);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const { data: before, error: beforeError } = await admin.from("modifier_groups")
      .select("id, name, description, min_selection, max_selection, required, sort_order, active")
      .eq("id", id).eq("organization_id", context.organizationId).eq("store_id", storeId).is("deleted_at", null).single();
    if (beforeError) throw beforeError;
    const { data: after, error } = await admin.from("modifier_groups").update({
      name: values.name,
      description: values.description ?? null,
      min_selection: values.minSelection,
      max_selection: values.maxSelection,
      required: values.required,
      sort_order: values.sortOrder,
      active: values.active,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    }).eq("id", id).eq("organization_id", context.organizationId).eq("store_id", storeId)
      .select("id, name, description, min_selection, max_selection, required, sort_order, active").single();
    if (error) throw error;
    await AuditService.record(context, { action: "modifier_group.updated", entityType: "modifier_group", entityId: id, before, after });
    return after;
  }

  static async createModifier(input: ModifierInput) {
    const values = modifierInputSchema.parse(input);
    const context = await authorize(PERMISSIONS.PRODUCTS_CREATE);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const { data: group, error: groupError } = await admin.from("modifier_groups").select("id")
      .eq("id", values.modifierGroupId).eq("organization_id", context.organizationId).eq("store_id", storeId).is("deleted_at", null).single();
    if (groupError || !group) throw new Error("Modifier group does not belong to the active store");
    const { data, error } = await admin.from("modifiers").insert({
      organization_id: context.organizationId,
      store_id: storeId,
      modifier_group_id: values.modifierGroupId,
      name: values.name,
      price_cents: values.priceCents,
      sort_order: values.sortOrder,
      active: values.active,
      created_by: context.userId,
      updated_by: context.userId,
    }).select("id, modifier_group_id, name, price_cents, sort_order, active").single();
    if (error) throw error;
    await AuditService.record(context, { action: "modifier.created", entityType: "modifier", entityId: data.id, after: data });
    await EventService.enqueue(context, { type: "modifier.created", entityType: "modifier", entityId: data.id, payload: { group_id: data.modifier_group_id } });
    return data;
  }

  static async setModifierActive(modifierId: string, active: boolean) {
    const id = uuidSchema.parse(modifierId);
    const context = await authorize(PERMISSIONS.PRODUCTS_EDIT);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const { data: before, error: beforeError } = await admin.from("modifiers").select("id, active")
      .eq("id", id).eq("organization_id", context.organizationId).eq("store_id", storeId).is("deleted_at", null).single();
    if (beforeError) throw beforeError;
    const { data: after, error } = await admin.from("modifiers").update({ active, updated_by: context.userId, updated_at: new Date().toISOString() })
      .eq("id", id).eq("organization_id", context.organizationId).eq("store_id", storeId).select("id, active").single();
    if (error) throw error;
    await AuditService.record(context, { action: "modifier.availability_changed", entityType: "modifier", entityId: id, before, after });
    return after;
  }

  static async linkGroupToProduct(productId: string, modifierGroupId: string, sortOrder = 0) {
    const values = productModifierGroupLinkSchema.parse({ productId, modifierGroupId, sortOrder });
    const context = await authorize(PERMISSIONS.PRODUCTS_EDIT);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();

    const [{ data: product, error: productError }, { data: group, error: groupError }] = await Promise.all([
      admin.from("products").select("id").eq("id", values.productId).eq("organization_id", context.organizationId).eq("store_id", storeId).is("deleted_at", null).maybeSingle(),
      admin.from("modifier_groups").select("id").eq("id", values.modifierGroupId).eq("organization_id", context.organizationId).eq("store_id", storeId).is("deleted_at", null).maybeSingle(),
    ]);
    if (productError) throw productError;
    if (groupError) throw groupError;
    if (!product || !group) throw new Error("Product and modifier group must belong to the active store");

    const { data, error } = await admin.from("product_modifier_groups").upsert({
      organization_id: context.organizationId,
      store_id: storeId,
      product_id: values.productId,
      modifier_group_id: values.modifierGroupId,
      sort_order: values.sortOrder,
    }, { onConflict: "product_id,modifier_group_id" }).select("product_id, modifier_group_id, sort_order").single();
    if (error) throw error;
    await AuditService.record(context, { action: "product.modifier_group_linked", entityType: "product", entityId: values.productId, after: data });
    await EventService.enqueue(context, { type: "product.modifier_group_linked", entityType: "product", entityId: values.productId, payload: { modifier_group_id: values.modifierGroupId } });
    return data;
  }

  static async unlinkGroupFromProduct(productId: string, modifierGroupId: string) {
    const product = uuidSchema.parse(productId);
    const group = uuidSchema.parse(modifierGroupId);
    const context = await authorize(PERMISSIONS.PRODUCTS_EDIT);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const { error } = await admin.from("product_modifier_groups").delete()
      .eq("product_id", product).eq("modifier_group_id", group)
      .eq("organization_id", context.organizationId).eq("store_id", storeId);
    if (error) throw error;
    await AuditService.record(context, { action: "product.modifier_group_unlinked", entityType: "product", entityId: product, before: { modifierGroupId: group } });
  }
}
