"use server";

import { revalidatePath } from "next/cache";
import { OrderService } from "@/server/orders/order-service";
import { PaymentService } from "@/server/payments/payment-service";
import { ManualDeliveryService } from "@/server/delivery/manual-delivery-service";
import { scheduleOrderWhatsAppNotifications } from "@/server/conversations/order-notification-dispatch";
import { friendlyOrderActionError } from "@/features/orders/order-action-error";
import { paymentAllowsOrderCompletion } from "@/server/orders/state-machines";

export type QuickFinishState = { ok: boolean; message: string | null; error: string | null };

const initialFinalStates = new Set(["completed", "canceled", "rejected"]);

function refreshOrder(orderId: string) {
  revalidatePath("/pedidos");
  revalidatePath(`/pedidos/${orderId}`);
  revalidatePath("/entregas");
  revalidatePath("/movimento");
}

async function current(orderId: string) {
  return (await OrderService.get(orderId)).order;
}

export async function quickFinishOrderAction(
  _previousState: QuickFinishState,
  formData: FormData,
): Promise<QuickFinishState> {
  const orderId = String(formData.get("orderId") ?? "");

  try {
    let order = await current(orderId);
    if (initialFinalStates.has(order.order_status)) {
      return { ok: true, message: "Pedido já está finalizado.", error: null };
    }

    // Pedidos externos precisam respeitar o ciclo confirmado pelo provedor.
    if (String(order.channel ?? "").toLowerCase().includes("ifood")) {
      throw new Error("Pedidos do iFood continuam usando o fluxo próprio de sincronização.");
    }

    if (order.order_status === "pending_confirmation") {
      await OrderService.confirm(orderId);
      scheduleOrderWhatsAppNotifications("order.confirmed");
      order = await current(orderId);
    }

    // Fecha a produção internamente, mantendo o histórico correto apesar de o quadro mostrar só Novo/Finalizado.
    if (order.production_status === "pending_confirmation") {
      await OrderService.startProduction(orderId);
      order = await current(orderId);
    }
    if (order.production_status === "queued") {
      await OrderService.setProduction(orderId, "preparing");
      order = await current(orderId);
    }
    if (order.production_status === "preparing") {
      await OrderService.setProduction(orderId, "ready");
      scheduleOrderWhatsAppNotifications("production.ready");
      order = await current(orderId);
    }

    if (order.fulfillment_type === "delivery") {
      if (order.fulfillment_status !== "delivered") {
        if (order.fulfillment_status !== "out_for_delivery") {
          await ManualDeliveryService.dispatch(orderId);
        }
        const result = await ManualDeliveryService.finish(orderId, true);
        refreshOrder(orderId);
        if (result.paymentConfirmed) scheduleOrderWhatsAppNotifications("payment.paid");
        scheduleOrderWhatsAppNotifications("delivery.delivered");
        if (result.completed) {
          return { ok: true, message: "Pedido finalizado.", error: null };
        }
        if (result.paymentIssue) throw new Error(result.paymentIssue);
      }
      order = await current(orderId);
    } else if (order.fulfillment_type === "pickup") {
      if (order.fulfillment_status === "pending") {
        await OrderService.setFulfillment(orderId, "awaiting_pickup");
        order = await current(orderId);
      }
      if (order.fulfillment_status === "awaiting_pickup") {
        await OrderService.setFulfillment(orderId, "picked_up_by_customer");
        order = await current(orderId);
      }
    } else if (order.fulfillment_status === "pending") {
      await OrderService.setFulfillment(orderId, "served");
      order = await current(orderId);
    }

    if (!paymentAllowsOrderCompletion(order.payment_status)) {
      await PaymentService.confirmDefaultForOrder(orderId);
      scheduleOrderWhatsAppNotifications("payment.paid");
      order = await current(orderId);
    }

    if (order.order_status === "confirmed") {
      await OrderService.complete(orderId);
    }

    scheduleOrderWhatsAppNotifications("order_manager.quick_finish");
    refreshOrder(orderId);
    return { ok: true, message: "Pedido finalizado.", error: null };
  } catch (error) {
    refreshOrder(orderId);
    return { ok: false, message: null, error: friendlyOrderActionError(error) };
  }
}
