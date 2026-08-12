import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize, AuthorizationError } from "@/server/access/authorize";
import { PERMISSIONS, type PermissionKey } from "@/server/access/permissions";

const uuid = z.string().uuid();
const idempotency = z.string().trim().min(8).max(240);
const driverInput = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(8).max(30).nullable().optional(),
  userId: z.string().uuid().nullable().optional(),
  maxActiveDeliveries: z.coerce.number().int().min(1).max(20).default(3),
});
const driverUpdate = driverInput.omit({ userId: true }).extend({ active: z.boolean(), onDuty: z.boolean() });
const transition = z.enum(["picked_up", "out_for_delivery", "delivered"]);

function requireStore(storeId: string | null) {
  if (!storeId) throw new Error("Uma unidade ativa é necessária");
  return storeId;
}

async function hasPermission(permission: PermissionKey, context: Awaited<ReturnType<typeof authorize>>) {
  try {
    await authorize(permission, context);
    return true;
  } catch (error) {
    if (error instanceof AuthorizationError) return false;
    throw error;
  }
}

export class DeliveryOperationsService {
  static async loadOperations() {
    const context = await authorize(PERMISSIONS.DELIVERY_ASSIGN);
    const storeId = requireStore(context.storeId);
    const admin = createAdminClient();
    const [driversResult, ordersResult, deliveriesResult, canManageDrivers] = await Promise.all([
      admin.from("drivers")
        .select("id,user_id,name,phone,active,on_duty,max_active_deliveries,updated_at")
        .eq("organization_id", context.organizationId).eq("store_id", storeId).is("deleted_at", null).order("name"),
      admin.from("orders")
        .select("id,display_number,customer_name_snapshot,customer_phone_snapshot,address_street_snapshot,address_number_snapshot,address_complement_snapshot,address_district_snapshot,address_city_snapshot,address_state_snapshot,address_reference_snapshot,delivery_fee_cents,delivery_estimated_min_minutes,delivery_estimated_max_minutes,order_status,payment_status,production_status,fulfillment_status,created_at,updated_at")
        .eq("organization_id", context.organizationId).eq("store_id", storeId).eq("fulfillment_type", "delivery")
        .eq("order_status", "confirmed").in("fulfillment_status", ["pending","awaiting_assignment","assigned","picked_up","out_for_delivery","delivered"])
        .order("created_at", { ascending: true }).limit(200),
      admin.from("deliveries")
        .select("id,order_id,driver_id,promised_by_at,assigned_at,picked_up_at,out_for_delivery_at,delivered_at,updated_at")
        .eq("organization_id", context.organizationId).eq("store_id", storeId),
      hasPermission(PERMISSIONS.DELIVERY_MANAGE, context),
    ]);
    for (const result of [driversResult, ordersResult, deliveriesResult]) if (result.error) throw result.error;

    const deliveries = new Map((deliveriesResult.data ?? []).map((row) => [row.order_id, row]));
    const activeByDriver = new Map<string, number>();
    for (const order of ordersResult.data ?? []) {
      const delivery = deliveries.get(order.id);
      if (!delivery?.driver_id || !["assigned","picked_up","out_for_delivery"].includes(order.fulfillment_status)) continue;
      activeByDriver.set(delivery.driver_id, (activeByDriver.get(delivery.driver_id) ?? 0) + 1);
    }
    return {
      context,
      canManageDrivers,
      drivers: (driversResult.data ?? []).map((driver) => ({ ...driver, activeDeliveries: activeByDriver.get(driver.id) ?? 0 })),
      deliveries: (ordersResult.data ?? []).map((order) => ({ ...order, delivery: deliveries.get(order.id) ?? null })),
    };
  }

  static async loadDriverView() {
    const context = await authorize(PERMISSIONS.DELIVERY_VIEW);
    const storeId = requireStore(context.storeId);
    const admin = createAdminClient();
    const { data: driver, error: driverError } = await admin.from("drivers")
      .select("id,name,phone,active,on_duty,max_active_deliveries")
      .eq("organization_id", context.organizationId).eq("store_id", storeId).eq("user_id", context.userId).is("deleted_at", null).maybeSingle();
    if (driverError) throw driverError;
    if (!driver) throw new Error("Seu usuário não está vinculado a um cadastro de entregador nesta unidade");

    const { data: deliveries, error } = await admin.from("deliveries")
      .select("id,order_id,driver_id,promised_by_at,assigned_at,picked_up_at,out_for_delivery_at,delivered_at")
      .eq("organization_id", context.organizationId).eq("store_id", storeId).eq("driver_id", driver.id)
      .order("updated_at", { ascending: false }).limit(50);
    if (error) throw error;
    const orderIds = (deliveries ?? []).map((item) => item.order_id);
    const ordersResult = orderIds.length
      ? await admin.from("orders")
        .select("id,display_number,customer_name_snapshot,customer_phone_snapshot,address_street_snapshot,address_number_snapshot,address_complement_snapshot,address_district_snapshot,address_city_snapshot,address_state_snapshot,address_reference_snapshot,fulfillment_status,production_status,delivery_estimated_min_minutes,delivery_estimated_max_minutes,created_at")
        .eq("organization_id", context.organizationId).eq("store_id", storeId).in("id", orderIds)
      : { data: [], error: null };
    if (ordersResult.error) throw ordersResult.error;
    const orderMap = new Map((ordersResult.data ?? []).map((order) => [order.id, order]));
    return {
      context,
      driver,
      deliveries: (deliveries ?? []).map((item) => ({ ...item, order: orderMap.get(item.order_id) ?? null }))
        .filter((item) => item.order && ["assigned","picked_up","out_for_delivery","delivered"].includes(item.order.fulfillment_status)),
    };
  }

  static async createDriver(input: z.input<typeof driverInput>) {
    const values = driverInput.parse(input);
    const context = await authorize(PERMISSIONS.DELIVERY_MANAGE);
    const storeId = requireStore(context.storeId);
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("delivery_create_driver_internal", {
      p_store_id: storeId,
      p_name: values.name,
      p_phone: values.phone ?? null,
      p_user_id: values.userId ?? null,
      p_max_active_deliveries: values.maxActiveDeliveries,
      p_actor_user_id: context.userId,
    });
    if (error) throw error;
    return data;
  }

  static async updateDriver(driverId: string, input: z.input<typeof driverUpdate>) {
    const id = uuid.parse(driverId);
    const values = driverUpdate.parse(input);
    const context = await authorize(PERMISSIONS.DELIVERY_MANAGE);
    const storeId = requireStore(context.storeId);
    const admin = createAdminClient();
    const { data: scoped, error: scopedError } = await admin.from("drivers").select("id")
      .eq("id", id).eq("organization_id", context.organizationId).eq("store_id", storeId).is("deleted_at", null).maybeSingle();
    if (scopedError) throw scopedError;
    if (!scoped) throw new Error("Entregador não encontrado");
    const { data, error } = await admin.rpc("delivery_update_driver_internal", {
      p_driver_id: id,
      p_name: values.name,
      p_phone: values.phone ?? null,
      p_active: values.active,
      p_on_duty: values.onDuty,
      p_max_active_deliveries: values.maxActiveDeliveries,
      p_actor_user_id: context.userId,
    });
    if (error) throw error;
    return data;
  }

  static async markWaiting(orderId: string, key: string = randomUUID()) {
    const id = uuid.parse(orderId);
    const safeKey = idempotency.parse(key);
    const context = await authorize(PERMISSIONS.DELIVERY_ASSIGN);
    const storeId = requireStore(context.storeId);
    const admin = createAdminClient();
    const { data: order, error: readError } = await admin.from("orders").select("id")
      .eq("id", id).eq("organization_id", context.organizationId).eq("store_id", storeId).eq("fulfillment_type", "delivery").maybeSingle();
    if (readError) throw readError;
    if (!order) throw new Error("Pedido de entrega não encontrado");
    const { data, error } = await admin.rpc("delivery_mark_waiting_internal", { p_order_id: id, p_idempotency_key: safeKey, p_actor_user_id: context.userId });
    if (error) throw error;
    return data;
  }

  static async assign(orderId: string, driverId: string, reason: string | null, key: string = randomUUID()) {
    const order = uuid.parse(orderId);
    const driver = uuid.parse(driverId);
    const safeKey = idempotency.parse(key);
    const context = await authorize(PERMISSIONS.DELIVERY_ASSIGN);
    const storeId = requireStore(context.storeId);
    const admin = createAdminClient();
    const [orderResult, driverResult] = await Promise.all([
      admin.from("orders").select("id").eq("id", order).eq("organization_id", context.organizationId).eq("store_id", storeId).eq("fulfillment_type", "delivery").maybeSingle(),
      admin.from("drivers").select("id").eq("id", driver).eq("organization_id", context.organizationId).eq("store_id", storeId).is("deleted_at", null).maybeSingle(),
    ]);
    if (orderResult.error) throw orderResult.error;
    if (driverResult.error) throw driverResult.error;
    if (!orderResult.data || !driverResult.data) throw new Error("Pedido ou entregador fora da unidade ativa");
    const { data, error } = await admin.rpc("delivery_assign_internal", {
      p_order_id: order,
      p_driver_id: driver,
      p_reason: reason?.trim() || null,
      p_idempotency_key: safeKey,
      p_actor_user_id: context.userId,
    });
    if (error) throw error;
    return data;
  }

  static async advance(deliveryId: string, toState: z.input<typeof transition>, key: string = randomUUID()) {
    const id = uuid.parse(deliveryId);
    const state = transition.parse(toState);
    const safeKey = idempotency.parse(key);
    const context = await authorize(PERMISSIONS.DELIVERY_UPDATE);
    const storeId = requireStore(context.storeId);
    const admin = createAdminClient();
    const { data: delivery, error: deliveryError } = await admin.from("deliveries")
      .select("id,driver_id").eq("id", id).eq("organization_id", context.organizationId).eq("store_id", storeId).maybeSingle();
    if (deliveryError) throw deliveryError;
    if (!delivery?.driver_id) throw new Error("Entrega não encontrada ou sem entregador");

    const canOperateAll = await hasPermission(PERMISSIONS.DELIVERY_ASSIGN, context);
    if (!canOperateAll) {
      const { data: driver, error: driverError } = await admin.from("drivers").select("user_id")
        .eq("id", delivery.driver_id).eq("organization_id", context.organizationId).eq("store_id", storeId).maybeSingle();
      if (driverError) throw driverError;
      if (!driver || driver.user_id !== context.userId) throw new Error("Delivery is not assigned to current driver");
    }

    const { data, error } = await admin.rpc("delivery_transition_internal", {
      p_delivery_id: id,
      p_to_state: state,
      p_idempotency_key: safeKey,
      p_actor_user_id: context.userId,
    });
    if (error) throw error;
    return data;
  }
}
