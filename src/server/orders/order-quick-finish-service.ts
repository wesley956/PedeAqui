import "server-only";

import { z } from "zod";
import { parseCustomWorkflowConfig } from "@/features/orders/workflow-config";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { paymentAllowsOrderCompletion, type PaymentStatus } from "@/server/orders/state-machines";
import { PaymentService } from "@/server/payments/payment-service";

const uuidSchema = z.string().uuid();
const offlinePaymentMethods = new Set(["cash", "credit_card", "debit_card"]);

function requireStoreId(storeId: string | null) {
  if (!storeId) throw new Error("Uma unidade ativa é necessária.");
  return storeId;
}

function isTwoStageFlow(stages: readonly string[]) {
  return stages.length === 2 && stages[0] === "new" && stages[1] === "finished";
}

export type QuickFinishResult = {
  completed: boolean;
  paymentConfirmed: boolean;
  message: string;
};

/**
 * Converts a custom Novo → Finalizado board into a real one-click operation.
 * The shortcut is intentionally guarded by the active store configuration and
 * is not available for external/provider-owned orders.
 */
export class OrderQuickFinishService {
  static async finish(orderId: string, paymentReceived = false): Promise<QuickFinishResult> {
    const id = uuidSchema.parse(orderId);
    const context = await authorize(PERMISSIONS.ORDERS_EDIT);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();

    const [{ data: settings, error: settingsError }, { data: order, error: orderError }, { data: external, error: externalError }] = await Promise.all([
      admin.from("store_operational_settings")
        .select("orders_workflow_mode, orders_custom_workflow")
        .eq("organization_id", context.organizationId)
        .eq("store_id", storeId)
        .maybeSingle(),
      admin.from("orders")
        .select("id, fulfillment_type, order_status, payment_status, payment_method_snapshot, production_status, fulfillment_status")
        .eq("id", id)
        .eq("organization_id", context.organizationId)
        .eq("store_id", storeId)
        .maybeSingle(),
      admin.from("external_orders")
        .select("provider")
        .eq("organization_id", context.organizationId)
        .eq("store_id", storeId)
        .eq("order_id", id)
        .maybeSingle(),
    ]);
    if (settingsError) throw settingsError;
    if (orderError) throw orderError;
    if (externalError) throw externalError;
    if (!order) throw new Error("Pedido não encontrado.");

    const custom = parseCustomWorkflowConfig(settings?.orders_custom_workflow);
    const selectedStages = order.fulfillment_type === "delivery" ? custom.delivery : custom.pickup;
    if (settings?.orders_workflow_mode !== "custom" || !custom.quickFinish || !isTwoStageFlow(selectedStages)) {
      throw new Error("A finalização rápida não está ativa para este fluxo.");
    }
    if (external) {
      throw new Error("Pedidos de plataforma externa precisam seguir a confirmação do provedor e não podem usar a finalização rápida.");
    }
    if (["rejected", "canceled"].includes(order.order_status)) {
      throw new Error("Este pedido não pode mais ser finalizado.");
    }
    if (order.order_status === "completed") {
      return { completed: true, paymentConfirmed: false, message: "Pedido já estava finalizado." };
    }

    const initialPaymentStatus = order.payment_status as PaymentStatus;
    let paymentConfirmed = false;
    if (!paymentAllowsOrderCompletion(initialPaymentStatus)) {
      const canConfirmAtCounter = ["pending", "authorized"].includes(initialPaymentStatus)
        && offlinePaymentMethods.has(order.payment_method_snapshot ?? "");
      if (!paymentReceived || !canConfirmAtCounter) {
        if (order.payment_method_snapshot === "pix") {
          throw new Error("O PIX ainda está pendente. Aguarde a confirmação do pagamento antes de finalizar.");
        }
        throw new Error("Confirme o recebimento do pagamento para finalizar este pedido.");
      }
      await PaymentService.confirmDefaultForOrder(id);
      paymentConfirmed = true;
    }

    const { data: finishResult, error: finishError } = await admin.rpc("order_quick_finish_internal", {
      p_order_id: id,
      p_actor_user_id: context.userId,
      p_source: "panel",
    });
    if (finishError) throw finishError;

    const completed = Boolean((finishResult as { completed?: boolean } | null)?.completed);
    if (!completed) throw new Error("O pedido não pôde ser concluído.");

    return {
      completed: true,
      paymentConfirmed,
      message: paymentConfirmed ? "Pagamento recebido e pedido finalizado." : "Pedido finalizado.",
    };
  }
}
