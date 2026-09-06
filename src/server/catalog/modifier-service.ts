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

function normalizedCatalogName(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");
}

export class ModifierService {
  static async listGroups() {
    const context = await authorize(PERMISSIONS.PRODUCTS_VIEW);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const { data, error } = await admin.from("modifier_groups")
      .select("id, name, description, min_selection, max_selection, required, selection_mode, distribution_total, sort_order, active, created_at, updated_at")
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
      selection_mode: values.selectionMode,
      distribution_total: values.distributionTotal ?? null,
      sort_order: values.sortOrder,
      active: values.active,
      created_by: context.userId,
      updated_by: context.userId,
    }).select("id, name, min_selection, max_selection, required, selection_mode, distribution_total, sort_order, active").single();
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
      .select("id, name, description, min_selection, max_selection, required, selection_mode, distribution_total, sort_order, active")
      .eq("id", id).eq("organization_id", context.organizationId).eq("store_id", storeId).is("deleted_at", null).single();
    if (beforeError) throw beforeError;
    const { data: after, error } = await admin.from("modifier_groups").update({
      name: values.name,
      description: values.description ?? null,
      min_selection: values.minSelection,
      max_selection: values.maxSelection,
      required: values.required,
      selection_mode: values.selectionMode,
      distribution_total: values.distributionTotal ?? null,
      sort_order: values.sortOrder,
      active: values.active,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    }).eq("id", id).eq("organization_id", context.organizationId).eq("store_id", storeId)
      .select("id, name, description, min_selection, max_selection, required, selection_mode, distribution_total, sort_order, active").single();
    if (error) throw error;
    await AuditService.record(context, { action: "modifier_group.updated", entityType: "modifier_group", entityId: id, before, after });
    return after;
  }

  static async setGroupActive(groupId: string, active: boolean) {
    const id = uuidSchema.parse(groupId);
    const context = await authorize(PERMISSIONS.PRODUCTS_EDIT);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const { data: before, error: beforeError } = await admin.from("modifier_groups")
      .select("id, name, active")
      .eq("id", id).eq("organization_id", context.organizationId).eq("store_id", storeId).is("deleted_at", null).single();
    if (beforeError) throw beforeError;
    const { data: after, error } = await admin.from("modifier_groups")
      .update({ active, updated_by: context.userId, updated_at: new Date().toISOString() })
      .eq("id", id).eq("organization_id", context.organizationId).eq("store_id", storeId)
      .select("id, name, active").single();
    if (error) throw error;
    await AuditService.record(context, { action: "modifier_group.availability_changed", entityType: "modifier_group", entityId: id, before, after });
    await EventService.enqueue(context, { type: "modifier_group.availability_changed", entityType: "modifier_group", entityId: id, payload: { active } });
    return after;
  }

  static async removeGroup(groupId: string) {
    const id = uuidSchema.parse(groupId);
    const context = await authorize(PERMISSIONS.PRODUCTS_DELETE);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const { data: before, error: beforeError } = await admin.from("modifier_groups")
      .select("id, name, active, deleted_at")
      .eq("id", id).eq("organization_id", context.organizationId).eq("store_id", storeId).is("deleted_at", null).single();
    if (beforeError) throw beforeError;
    const deletedAt = new Date().toISOString();
    const { error } = await admin.from("modifier_groups")
      .update({ active: false, deleted_at: deletedAt, updated_by: context.userId, updated_at: deletedAt })
      .eq("id", id).eq("organization_id", context.organizationId).eq("store_id", storeId);
    if (error) throw error;
    await AuditService.record(context, { action: "modifier_group.deleted", entityType: "modifier_group", entityId: id, before, after: { ...before, active: false, deleted_at: deletedAt } });
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

  static async updateModifier(modifierId: string, input: ModifierInput) {
    const id = uuidSchema.parse(modifierId);
    const values = modifierInputSchema.parse(input);
    const context = await authorize(PERMISSIONS.PRODUCTS_EDIT);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const [{ data: group, error: groupError }, { data: before, error: beforeError }] = await Promise.all([
      admin.from("modifier_groups").select("id").eq("id", values.modifierGroupId).eq("organization_id", context.organizationId).eq("store_id", storeId).is("deleted_at", null).maybeSingle(),
      admin.from("modifiers").select("id, modifier_group_id, name, price_cents, sort_order, active").eq("id", id).eq("organization_id", context.organizationId).eq("store_id", storeId).is("deleted_at", null).single(),
    ]);
    if (groupError) throw groupError;
    if (!group) throw new Error("Modifier group does not belong to the active store");
    if (beforeError) throw beforeError;
    const { data: after, error } = await admin.from("modifiers").update({
      modifier_group_id: values.modifierGroupId,
      name: values.name,
      price_cents: values.priceCents,
      sort_order: values.sortOrder,
      active: values.active,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    }).eq("id", id).eq("organization_id", context.organizationId).eq("store_id", storeId).select("id, modifier_group_id, name, price_cents, sort_order, active").single();
    if (error) throw error;
    await AuditService.record(context, { action: "modifier.updated", entityType: "modifier", entityId: id, before, after });
    return after;
  }

  static async removeModifier(modifierId: string) {
    const id = uuidSchema.parse(modifierId);
    const context = await authorize(PERMISSIONS.PRODUCTS_DELETE);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const { data: before, error: beforeError } = await admin.from("modifiers").select("id, name, active, deleted_at").eq("id", id).eq("organization_id", context.organizationId).eq("store_id", storeId).is("deleted_at", null).single();
    if (beforeError) throw beforeError;
    const deletedAt = new Date().toISOString();
    const { error } = await admin.from("modifiers").update({ active: false, deleted_at: deletedAt, updated_by: context.userId, updated_at: deletedAt }).eq("id", id).eq("organization_id", context.organizationId).eq("store_id", storeId);
    if (error) throw error;
    await AuditService.record(context, { action: "modifier.deleted", entityType: "modifier", entityId: id, before, after: { ...before, active: false, deleted_at: deletedAt } });
  }

  static async setModifierActive(modifierId: string, active: boolean, scope: "single" | "matching_name" = "single") {
    const id = uuidSchema.parse(modifierId);
    const context = await authorize(PERMISSIONS.PRODUCTS_EDIT);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const { data: target, error: targetError } = await admin.from("modifiers").select("id, modifier_group_id, name, active").eq("id", id).eq("organization_id", context.organizationId).eq("store_id", storeId).is("deleted_at", null).single();
    if (targetError) throw targetError;

    const { data: storeModifiers, error: modifiersError } = await admin.from("modifiers")
      .select("id, modifier_group_id, name, active")
      .eq("organization_id", context.organizationId).eq("store_id", storeId).is("deleted_at", null);
    if (modifiersError) throw modifiersError;
    const affected = scope === "matching_name"
      ? (storeModifiers ?? []).filter((item) => normalizedCatalogName(item.name) === normalizedCatalogName(target.name))
      : [target];
    const affectedIds = affected.map((item) => item.id);
    const affectedIdSet = new Set(affectedIds);
    const affectedGroupIds = [...new Set(affected.map((item) => item.modifier_group_id))];

    if (!active && affectedGroupIds.length > 0) {
      const { data: groups, error: groupsError } = await admin.from("modifier_groups")
        .select("id, name, min_selection, selection_mode, active")
        .eq("organization_id", context.organizationId).eq("store_id", storeId).in("id", affectedGroupIds).is("deleted_at", null);
      if (groupsError) throw groupsError;
      for (const group of groups ?? []) {
        if (!group.active || Number(group.min_selection) === 0) continue;
        const remaining = (storeModifiers ?? []).filter((item) => item.modifier_group_id === group.id && item.active && !affectedIdSet.has(item.id)).length;
        const requiredChoices = group.selection_mode === "quantity_per_option" ? 1 : Number(group.min_selection);
        if (remaining < requiredChoices) {
          throw new Error(`Não é possível pausar esta opção: o grupo obrigatório “${group.name}” ficaria sem escolhas suficientes.`);
        }
      }
    }

    const before = affected.map(({ id: itemId, modifier_group_id, name, active: currentActive }) => ({ id: itemId, modifier_group_id, name, active: currentActive }));
    const { data: after, error } = await admin.from("modifiers").update({ active, updated_by: context.userId, updated_at: new Date().toISOString() }).in("id", affectedIds).eq("organization_id", context.organizationId).eq("store_id", storeId).select("id, modifier_group_id, name, active");
    if (error) throw error;
    await AuditService.record(context, { action: "modifier.availability_changed", entityType: "modifier", entityId: id, before, after: { items: after, scope, affectedCount: affectedIds.length } });
    await EventService.enqueue(context, { type: "modifier.availability_changed", entityType: "modifier", entityId: id, payload: { active, scope, affected_count: affectedIds.length } });
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
    const { data, error } = await admin.from("product_modifier_groups").upsert({ organization_id: context.organizationId, store_id: storeId, product_id: values.productId, modifier_group_id: values.modifierGroupId, sort_order: values.sortOrder }, { onConflict: "product_id,modifier_group_id" }).select("product_id, modifier_group_id, sort_order").single();
    if (error) throw error;
    await AuditService.record(context, { action: "product.modifier_group_linked", entityType: "product", entityId: values.productId, after: data });
    await EventService.enqueue(context, { type: "product.modifier_group_linked", entityType: "product", entityId: values.productId, payload: { modifier_group_id: values.modifierGroupId } });
    return data;
  }

  static async listProductGroupLinks(productId: string) {
    const product = uuidSchema.parse(productId);
    const context = await authorize(PERMISSIONS.PRODUCTS_VIEW);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const { data: ownedProduct, error: productError } = await admin.from("products").select("id").eq("id", product).eq("organization_id", context.organizationId).eq("store_id", storeId).is("deleted_at", null).maybeSingle();
    if (productError) throw productError;
    if (!ownedProduct) throw new Error("Product does not belong to the active store");
    const { data, error } = await admin.from("product_modifier_groups").select("modifier_group_id, sort_order").eq("product_id", product).eq("organization_id", context.organizationId).eq("store_id", storeId).order("sort_order");
    if (error) throw error;
    return data ?? [];
  }

  static async unlinkGroupFromProduct(productId: string, modifierGroupId: string) {
    const product = uuidSchema.parse(productId);
    const group = uuidSchema.parse(modifierGroupId);
    const context = await authorize(PERMISSIONS.PRODUCTS_EDIT);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const { error } = await admin.from("product_modifier_groups").delete().eq("product_id", product).eq("modifier_group_id", group).eq("organization_id", context.organizationId).eq("store_id", storeId);
    if (error) throw error;
    await AuditService.record(context, { action: "product.modifier_group_unlinked", entityType: "product", entityId: product, before: { modifierGroupId: group } });
  }
}
