import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { isManualDeliveryMode, isOfflineDeliveryPayment } from "@/modules/manual-delivery";
import type { PaymentCompletionPolicy } from "@/modules/payment-completion-policy";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { ModuleAccessService } from "@/server/modules/module-access-service";
import { OrderService } from "@/server/orders/order-service";
import { PaymentService } from "@/server/payments/payment-service";
import type { FulfillmentStatus, PaymentStatus } from "@/server/orders/state-machines";

const uuid = z.string().uuid();
const settledPaymentStatuses: readonly PaymentStatus[] = ["paid", "partially_refunded", "refunded"];

function requireStore(storeId: string | null) {
  if (!storeId) throw new Error("Uma unidade ativa é necessária");
  return storeId;
}

async function loadManualContext() {
  const context = await authorize(PERMISSIONS.ORDERS_EDIT);
  const modules = await ModuleAccessService.load(context);
  const admin = createAdminClient();
  const { data: settings, error } = await admin.from("store_operational_settings").select("delivery_operation_level,payment_completion_policy").eq("organization_id",context.organizationId).eq("store_id",requireStore(context.storeId)).maybeSingle();
  if(error) throw error;
  if (!isManualDeliveryMode(modules.enabledModuleKeys, settings?.delivery_operation_level)) {
    throw new Error("A entrega manual só está disponível quando Entregas ou Entregadores está desativado para a loja.");
  }
  return { context, storeId: requireStore(context.storeId), paymentCompletionPolicy: settings?.payment_completion_policy as PaymentCompletionPolicy | null | undefined };
}

async function loadOrder(orderId: string) {
  const id = uuid.parse(orderId);
  const { context, storeId, paymentCompletionPolicy } = await loadManualContext();
  const admin = createAdminClient();
  const { data, error } = await admin.from("orders")
    .select("id, fulfillment_type, order_status, production_status, fulfillment_status, payment_status, payment_method_snapshot")
    .eq("id", id)
    .eq("organization_id", context.organizationId)
    .eq("store_id", storeId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Pedido não encontrado.");
  if (data.fulfillment_type !== "delivery") throw new Error("Este pedido não é de entrega.");
  if (data.order_status !== "confirmed") throw new Error("O pedido precisa estar confirmado.");
  if (!["ready", "not_required"].includes(data.production_status)) throw new Error("O pedido precisa estar pronto antes de sair para entrega.");
  return { ...data, paymentCompletionPolicy };
}

export type ManualDeliveryFinishResult = {
  delivered: boolean;
  paymentConfirmed: boolean;
  paymentPending: boolean;
  completed: boolean;
  paymentIssue: string | null;
};

export class ManualDeliveryService {
  static async dispatch(orderId: string) {
    const order = await loadOrder(orderId);
    const current = order.fulfillment_status as FulfillmentStatus;
    if (current === "delivered") return { changed: false, status: current };
    const context = await authorize(PERMISSIONS.ORDERS_EDIT);
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("manual_delivery_dispatch_internal", { p_order_id: order.id, p_actor_user_id: context.userId, p_reason: "Entrega manual sem gestão de motoboy" });
    if (error) throw error;
    return data as { changed: boolean; status: "out_for_delivery" };
  }

  static async finish(orderId: string, paymentReceived = false): Promise<ManualDeliveryFinishResult> {
    const order = await loadOrder(orderId);
    const current = order.fulfillment_status as FulfillmentStatus;
    if (current !== "out_for_delivery" && current !== "delivered") {
      throw new Error("Marque primeiro que o pedido saiu para entrega.");
    }

    let delivered = current === "delivered";
    if (!delivered) {
      await OrderService.setFulfillment(order.id, "delivered", "Entrega confirmada no fluxo manual");
      delivered = true;
    }

    let paymentStatus = order.payment_status as PaymentStatus;
    let paymentConfirmed = false;
    let paymentIssue: string | null = null;

    const legacyAutoConfirmation = order.paymentCompletionPolicy == null;
    const quickConfirmation = order.paymentCompletionPolicy === "quick_confirmation" && paymentReceived;
    if (!settledPaymentStatuses.includes(paymentStatus) && isOfflineDeliveryPayment(order.payment_method_snapshot) && (legacyAutoConfirmation || quickConfirmation)) {
      try {
        await PaymentService.confirmDefaultForOrder(order.id);
        paymentStatus = "paid";
        paymentConfirmed = true;
      } catch (error) {
        paymentIssue = error instanceof Error ? error.message : "Não foi possível confirmar o pagamento.";
      }
    }

    const paymentPending = !settledPaymentStatuses.includes(paymentStatus);
    let completed = false;
    if (!paymentPending) {
      await OrderService.complete(order.id);
      completed = true;
    }

    return { delivered, paymentConfirmed, paymentPending, completed, paymentIssue };
  }
}
