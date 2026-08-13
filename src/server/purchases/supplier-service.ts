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

export class SupplierService {
  static async load() {
    const context = await authorize(PERMISSIONS.SUPPLIERS_VIEW);
    const storeId = requireStore(context.storeId);
    const admin = createAdminClient();
    const [suppliersResult, configsResult, catalogResult, inventoryResult, inventoryConfigsResult, canManage] = await Promise.all([
      admin.from("suppliers").select("id,name,legal_name,tax_document,email,phone,notes,active,created_at").eq("organization_id", context.organizationId).is("deleted_at", null).order("name"),
      admin.from("supplier_stores").select("supplier_id,active,lead_time_days,minimum_order_cents,notes").eq("organization_id", context.organizationId).eq("store_id", storeId),
      admin.from("supplier_inventory_items").select("supplier_id,inventory_item_id,active,is_preferred,supplier_sku,purchase_unit_label,base_units_per_purchase_unit,last_unit_cost_cents").eq("organization_id", context.organizationId).eq("store_id", storeId),
      admin.from("inventory_items").select("id,name,sku,base_unit,active").eq("organization_id", context.organizationId).is("deleted_at", null).order("name"),
      admin.from("inventory_item_stores").select("inventory_item_id,active").eq("organization_id", context.organizationId).eq("store_id", storeId),
      can(PERMISSIONS.SUPPLIERS_MANAGE, context),
    ]);
    for (const result of [suppliersResult, configsResult, catalogResult, inventoryResult, inventoryConfigsResult]) if (result.error) throw result.error;
    const configMap = new Map((configsResult.data ?? []).map((row) => [row.supplier_id, row]));
    const activeInventory = new Set((inventoryConfigsResult.data ?? []).filter((row) => row.active).map((row) => row.inventory_item_id));
    const inventory = (inventoryResult.data ?? []).filter((item) => item.active && activeInventory.has(item.id));
    const suppliers = (suppliersResult.data ?? []).map((supplier) => ({
      ...supplier,
      config: configMap.get(supplier.id) ?? null,
      catalog: (catalogResult.data ?? []).filter((row) => row.supplier_id === supplier.id),
    }));
    return { context, storeId, suppliers, inventory, canManage };
  }

  static async create(input: { name: string; legalName?: string | null; taxDocument?: string | null; email?: string | null; phone?: string | null; notes?: string | null; leadTimeDays: number; minimumOrder: string }) {
    const context = await authorize(PERMISSIONS.SUPPLIERS_MANAGE);
    const storeId = requireStore(context.storeId);
    const leadTimeDays = z.number().int().min(0).max(365).parse(input.leadTimeDays);
    const minimumOrderCents = input.minimumOrder.trim() ? parseMoneyToCents(input.minimumOrder) : 0;
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("supplier_create_internal", {
      p_store_id: storeId, p_name: input.name.trim(), p_legal_name: input.legalName?.trim() || null,
      p_tax_document: input.taxDocument?.trim() || null, p_email: input.email?.trim() || null, p_phone: input.phone?.trim() || null,
      p_notes: input.notes?.trim() || null, p_lead_time_days: leadTimeDays, p_minimum_order_cents: minimumOrderCents, p_actor_user_id: context.userId,
    });
    if (error) throw error; return data;
  }

  static async configure(input: { supplierId: string; active: boolean; leadTimeDays: number; minimumOrder: string; notes?: string | null }) {
    const context = await authorize(PERMISSIONS.SUPPLIERS_MANAGE);
    const storeId = requireStore(context.storeId);
    const supplierId = uuid.parse(input.supplierId);
    const minimumOrderCents = input.minimumOrder.trim() ? parseMoneyToCents(input.minimumOrder) : 0;
    const admin = createAdminClient();
    const { data: scoped, error: scopedError } = await admin.from("suppliers").select("id").eq("id", supplierId).eq("organization_id", context.organizationId).is("deleted_at", null).maybeSingle();
    if (scopedError) throw scopedError; if (!scoped) throw new Error("Fornecedor fora da organização");
    const { data, error } = await admin.rpc("supplier_configure_store_internal", {
      p_store_id: storeId, p_supplier_id: supplierId, p_active: input.active, p_lead_time_days: z.number().int().min(0).max(365).parse(input.leadTimeDays),
      p_minimum_order_cents: minimumOrderCents, p_notes: input.notes?.trim() || null, p_actor_user_id: context.userId,
    });
    if (error) throw error; return data;
  }

  static async upsertCatalog(input: { supplierId: string; inventoryItemId: string; active: boolean; preferred: boolean; supplierSku?: string | null; purchaseUnitLabel: string; baseUnitsPerPurchaseUnit: string; unitCostInput: string }) {
    const context = await authorize(PERMISSIONS.SUPPLIERS_MANAGE);
    const storeId = requireStore(context.storeId);
    const supplierId = uuid.parse(input.supplierId); const inventoryItemId = uuid.parse(input.inventoryItemId);
    const factor = parseInventoryQuantity(input.baseUnitsPerPurchaseUnit);
    const unitCostCents = input.unitCostInput.trim() ? parseMoneyToCents(input.unitCostInput) : 0;
    const admin = createAdminClient();
    const [supplierConfig, inventoryConfig] = await Promise.all([
      admin.from("supplier_stores").select("supplier_id").eq("organization_id", context.organizationId).eq("store_id", storeId).eq("supplier_id", supplierId).eq("active", true).maybeSingle(),
      admin.from("inventory_item_stores").select("inventory_item_id").eq("organization_id", context.organizationId).eq("store_id", storeId).eq("inventory_item_id", inventoryItemId).eq("active", true).maybeSingle(),
    ]);
    if (supplierConfig.error) throw supplierConfig.error; if (inventoryConfig.error) throw inventoryConfig.error;
    if (!supplierConfig.data || !inventoryConfig.data) throw new Error("Fornecedor e insumo precisam estar ativos nesta unidade");
    const { data, error } = await admin.rpc("supplier_catalog_upsert_internal", {
      p_store_id: storeId, p_supplier_id: supplierId, p_inventory_item_id: inventoryItemId, p_active: input.active,
      p_preferred: input.preferred, p_supplier_sku: input.supplierSku?.trim() || null, p_purchase_unit_label: input.purchaseUnitLabel.trim(),
      p_base_units_per_purchase_unit: factor, p_last_unit_cost_cents: unitCostCents, p_actor_user_id: context.userId,
    });
    if (error) throw error; return data;
  }
}
