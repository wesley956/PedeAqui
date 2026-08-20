import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { ModuleAccessService } from "@/server/modules/module-access-service";

const typeSchema = z.object({
  code: z.string().trim().min(1).max(24),
  name: z.string().trim().min(2).max(100),
  nominalWeightKg: z.number().positive().max(9999).nullable().optional(),
});
const productSchema = z.object({
  productId: z.string().uuid(),
  containerTypeId: z.string().uuid(),
  exchangeEnabled: z.boolean().default(true),
  containerSaleEnabled: z.boolean().default(true),
  requireContainerChoice: z.boolean().default(true),
  containerSurchargeCents: z.number().int().min(0).max(10_000_000),
});
const adjustmentSchema = z.object({
  containerTypeId: z.string().uuid(),
  fullDelta: z.number().int().min(-100000).max(100000).default(0),
  emptyDelta: z.number().int().min(-100000).max(100000).default(0),
  inRouteDelta: z.number().int().min(-100000).max(100000).default(0),
  reason: z.string().trim().min(3).max(500),
  idempotencyKey: z.string().trim().min(8).max(240),
}).refine((value) => value.fullDelta !== 0 || value.emptyDelta !== 0 || value.inRouteDelta !== 0, "Movimento não pode ser zero");

export class GasContainerService {
  static async load() {
    const access = await ModuleAccessService.require("gas_containers");
    const { context } = access;
    const admin = createAdminClient();
    const [balances, profiles, products, movements] = await Promise.all([
      admin.from("gas_container_balances").select("container_type_id,code,name,nominal_weight_kg,active,full_quantity,empty_quantity,in_route_quantity").eq("organization_id", context.organizationId).eq("store_id", context.storeId).order("code"),
      admin.from("product_gas_profiles").select("product_id,container_type_id,exchange_enabled,container_sale_enabled,require_container_choice,container_surcharge_cents,active").eq("organization_id", context.organizationId).eq("store_id", context.storeId),
      admin.from("products").select("id,name,active,availability").eq("organization_id", context.organizationId).eq("store_id", context.storeId).is("deleted_at", null).order("name"),
      admin.from("gas_container_movements").select("id,container_type_id,movement_kind,full_delta,empty_delta,in_route_delta,reason,created_at").eq("organization_id", context.organizationId).eq("store_id", context.storeId).order("created_at", { ascending: false }).limit(30),
    ]);
    for (const result of [balances, profiles, products, movements]) if (result.error) throw result.error;
    return { access, balances: balances.data ?? [], profiles: profiles.data ?? [], products: products.data ?? [], movements: movements.data ?? [] };
  }

  static async createType(input: z.input<typeof typeSchema>) {
    const values = typeSchema.parse(input);
    const access = await ModuleAccessService.require("gas_containers");
    await authorize(PERMISSIONS.GAS_CONTAINERS_MANAGE, access.context);
    const admin = createAdminClient();
    const { data, error } = await admin.from("gas_container_types").insert({
      organization_id: access.context.organizationId,
      store_id: access.context.storeId,
      code: values.code.toUpperCase(),
      name: values.name,
      nominal_weight_kg: values.nominalWeightKg ?? null,
      created_by: access.context.userId,
      updated_by: access.context.userId,
    }).select("id,code,name").single();
    if (error) throw error;
    return data;
  }

  static async configureProduct(input: z.input<typeof productSchema>) {
    const values = productSchema.parse(input);
    const access = await ModuleAccessService.require("gas_containers");
    await authorize(PERMISSIONS.GAS_CONTAINERS_MANAGE, access.context);
    const admin = createAdminClient();
    const [{ data: product, error: productError }, { data: containerType, error: typeError }] = await Promise.all([
      admin.from("products").select("id").eq("organization_id", access.context.organizationId).eq("store_id", access.context.storeId).eq("id", values.productId).is("deleted_at", null).maybeSingle(),
      admin.from("gas_container_types").select("id").eq("organization_id", access.context.organizationId).eq("store_id", access.context.storeId).eq("id", values.containerTypeId).eq("active", true).maybeSingle(),
    ]);
    if (productError) throw productError;
    if (typeError) throw typeError;
    if (!product || !containerType) throw new Error("Produto ou tipo de vasilhame inválido para esta unidade.");
    const { error } = await admin.from("product_gas_profiles").upsert({
      organization_id: access.context.organizationId,
      store_id: access.context.storeId,
      product_id: values.productId,
      container_type_id: values.containerTypeId,
      exchange_enabled: values.exchangeEnabled,
      container_sale_enabled: values.containerSaleEnabled,
      require_container_choice: values.requireContainerChoice,
      container_surcharge_cents: values.containerSurchargeCents,
      active: true,
      updated_by: access.context.userId,
    }, { onConflict: "product_id" });
    if (error) throw error;
  }

  static async adjust(input: z.input<typeof adjustmentSchema>) {
    const values = adjustmentSchema.parse(input);
    const access = await ModuleAccessService.require("gas_containers");
    await authorize(PERMISSIONS.GAS_CONTAINERS_MANAGE, access.context);
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("gas_container_adjust_internal", {
      p_organization_id: access.context.organizationId,
      p_store_id: access.context.storeId,
      p_container_type_id: values.containerTypeId,
      p_full_delta: values.fullDelta,
      p_empty_delta: values.emptyDelta,
      p_in_route_delta: values.inRouteDelta,
      p_idempotency_key: values.idempotencyKey,
      p_reason: values.reason,
      p_actor_user_id: access.context.userId,
    });
    if (error) throw error;
    return data;
  }

  static async hasInRouteBlocker(organizationId: string, storeId: string) {
    const admin = createAdminClient();
    const { data, error } = await admin.from("gas_container_balances").select("container_type_id").eq("organization_id", organizationId).eq("store_id", storeId).neq("in_route_quantity", 0).limit(1);
    if (error) throw error;
    return (data ?? []).length > 0;
  }
}
