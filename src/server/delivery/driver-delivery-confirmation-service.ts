import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize, AuthorizationError } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";

const uuid = z.string().uuid();
const idempotency = z.string().trim().min(8).max(220);
const confirmationSchema = z.object({
  paymentReceived: z.boolean(),
  paymentNote: z.string().trim().max(500).nullable().optional(),
}).superRefine((value, context) => {
  if (!value.paymentReceived && (value.paymentNote?.trim().length ?? 0) < 3) {
    context.addIssue({ code: "custom", path: ["paymentNote"], message: "Informe o que aconteceu com o pagamento." });
  }
});

async function canOperateAllDeliveries(context: Awaited<ReturnType<typeof authorize>>) {
  try {
    await authorize(PERMISSIONS.DELIVERY_ASSIGN, context);
    return true;
  } catch (error) {
    if (error instanceof AuthorizationError) return false;
    throw error;
  }
}

export type DriverDeliveryConfirmationResult = {
  delivery_id: string;
  order_id: string;
  changed: boolean;
  payment_confirmed: boolean;
  payment_received: boolean;
  payment_status: string;
  order_status: string;
};

export class DriverDeliveryConfirmationService {
  static async confirm(
    deliveryId: string,
    input: z.input<typeof confirmationSchema>,
    key: string = randomUUID(),
  ): Promise<DriverDeliveryConfirmationResult> {
    const id = uuid.parse(deliveryId);
    const values = confirmationSchema.parse(input);
    const safeKey = idempotency.parse(key);
    const context = await authorize(PERMISSIONS.DELIVERY_UPDATE);
    if (!context.storeId) throw new Error("Uma unidade ativa é necessária");

    const admin = createAdminClient();
    const { data: delivery, error: deliveryError } = await admin.from("deliveries")
      .select("id,driver_id")
      .eq("id", id)
      .eq("organization_id", context.organizationId)
      .eq("store_id", context.storeId)
      .maybeSingle();
    if (deliveryError) throw deliveryError;
    if (!delivery?.driver_id) throw new Error("Entrega não encontrada ou sem entregador");

    if (!(await canOperateAllDeliveries(context))) {
      const { data: driver, error: driverError } = await admin.from("drivers")
        .select("user_id")
        .eq("id", delivery.driver_id)
        .eq("organization_id", context.organizationId)
        .eq("store_id", context.storeId)
        .maybeSingle();
      if (driverError) throw driverError;
      if (!driver || driver.user_id !== context.userId) throw new Error("Delivery is not assigned to current driver");
    }

    const { data, error } = await admin.rpc("delivery_confirm_with_payment_internal", {
      p_delivery_id: id,
      p_payment_received: values.paymentReceived,
      p_payment_note: values.paymentNote?.trim() || null,
      p_idempotency_key: safeKey,
      p_actor_user_id: context.userId,
    });
    if (error) throw error;
    return data as DriverDeliveryConfirmationResult;
  }
}
