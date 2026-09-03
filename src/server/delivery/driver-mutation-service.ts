import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";

const uuid = z.string().uuid();
const idempotencyKey = z.string().trim().min(8).max(240);
const driverInput = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(8).max(30).nullable().optional(),
  userId: z.string().uuid().nullable().optional(),
  maxActiveDeliveries: z.coerce.number().int().min(1).max(20).default(3),
});
const driverUpdate = driverInput.omit({ userId: true }).extend({
  active: z.boolean(),
  onDuty: z.boolean(),
});

function requireStore(storeId: string | null) {
  if (!storeId) throw new Error("Uma unidade ativa é necessária");
  return storeId;
}

export class DriverMutationService {
  static async createDriver(input: z.input<typeof driverInput>, key: string) {
    const values = driverInput.parse(input);
    const safeKey = idempotencyKey.parse(key);
    const context = await authorize(PERMISSIONS.DELIVERY_MANAGE);
    const storeId = requireStore(context.storeId);
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("delivery_create_driver_idempotent_internal", {
      p_store_id: storeId,
      p_name: values.name,
      p_phone: values.phone ?? null,
      p_user_id: values.userId ?? null,
      p_max_active_deliveries: values.maxActiveDeliveries,
      p_idempotency_key: safeKey,
      p_actor_user_id: context.userId,
    });
    if (error) throw error;
    return data;
  }

  static async updateDriver(driverId: string, input: z.input<typeof driverUpdate>, key: string) {
    const id = uuid.parse(driverId);
    const values = driverUpdate.parse(input);
    const safeKey = idempotencyKey.parse(key);
    const context = await authorize(PERMISSIONS.DELIVERY_MANAGE);
    const storeId = requireStore(context.storeId);
    const admin = createAdminClient();

    const { data: scoped, error: scopedError } = await admin
      .from("drivers")
      .select("id")
      .eq("id", id)
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .is("deleted_at", null)
      .maybeSingle();
    if (scopedError) throw scopedError;
    if (!scoped) throw new Error("Entregador não encontrado");

    const { data, error } = await admin.rpc("delivery_update_driver_idempotent_internal", {
      p_driver_id: id,
      p_name: values.name,
      p_phone: values.phone ?? null,
      p_active: values.active,
      p_on_duty: values.onDuty,
      p_max_active_deliveries: values.maxActiveDeliveries,
      p_idempotency_key: safeKey,
      p_actor_user_id: context.userId,
    });
    if (error) throw error;
    return data;
  }
}
