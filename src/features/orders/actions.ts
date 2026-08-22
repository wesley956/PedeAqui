"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { cartCookieName } from "@/server/cart/cart-token";
import { OrderNotificationContextService } from "@/server/conversations/order-notification-context-service";
import { scheduleOrderWhatsAppNotifications } from "@/server/conversations/order-notification-dispatch";
import { CustomerRecognitionService } from "@/server/customers/recognition-service";
import { CUSTOMER_RECOGNITION_MAX_AGE_SECONDS, customerRecognitionCookieName } from "@/server/customers/recognition-token";
import { orderCookieName } from "@/server/orders/order-token";
import { OrderService } from "@/server/orders/order-service";
import { logger } from "@/server/observability/logger";
import { PaymentService } from "@/server/payments/payment-service";
import { PrintQueueService } from "@/server/printing/print-queue-service";
import { DeliveryOperationsService } from "@/server/delivery/delivery-operations-service";
import type { FulfillmentStatus, ProductionStatus } from "@/server/orders/state-machines";
import { friendlyOrderActionError } from "@/features/orders/order-action-error";

export async function createOrderFromCheckoutAction(formData: FormData) {
  const storeSlug = String(formData.get("storeSlug") ?? "");
  const cookieStore = await cookies();
  const cartCookie = cartCookieName(storeSlug);
  const token = cookieStore.get(cartCookie)?.value;
  if (!token) redirect(`/m/${storeSlug}/carrinho`);

  const result = await OrderService.createFromCheckout(storeSlug, token);
  await OrderNotificationContextService.capture(result.order_id, result.accessToken);
  scheduleOrderWhatsAppNotifications("checkout.order_created");
  cookieStore.set(orderCookieName(storeSlug, result.order_id), result.accessToken, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: `/m/${storeSlug}/pedido/${result.order_id}`, maxAge: 30 * 24 * 60 * 60,
  });

  try {
    const recognition = await CustomerRecognitionService.issueFromOrder(result.order_id);
    if (recognition) {
      cookieStore.set(customerRecognitionCookieName(storeSlug), recognition.token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: `/m/${storeSlug}`,
        maxAge: CUSTOMER_RECOGNITION_MAX_AGE_SECONDS,
      });
    }
  } catch (error) {
    logger.warn("customer_recognition_issue_failed", {
      orderId: result.order_id,
      errorType: error instanceof Error ? error.name : "unknown",
    });
  }

  cookieStore.set(cartCookie, "", {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: `/m/${storeSlug}`, maxAge: 0,
  });
  redirect(`/m/${storeSlug}/pedido/${result.order_id}`);
}

function refreshOrder(orderId: string) {
  revalidatePath("/pedidos");
  revalidatePath(`/pedidos/${orderId}`);
  revalidatePath("/entregas");
  revalidatePath("/entregador");
}

export async function cancelOrderAction(formData: FormData) {
  const orderId = String(formData.get("orderId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  await OrderService.cancel(orderId, reason);
  scheduleOrderWhatsAppNotifications("order.canceled");
  refreshOrder(orderId);
}
export async function confirmOrderAction(formData: FormData) {
  const orderId = String(formData.get("orderId") ?? "");
  await OrderService.confirm(orderId);
  scheduleOrderWhatsAppNotifications("order.confirmed");
  refreshOrder(orderId);
}
export async function transitionProductionAction(formData: FormData) {
  const orderId = String(formData.get("orderId") ?? "");
  const status = String(formData.get("status") ?? "") as ProductionStatus;
  await OrderService.setProduction(orderId, status);
  scheduleOrderWhatsAppNotifications(`production.${status}`);
  refreshOrder(orderId);
}
export async function transitionPaymentAction(formData: FormData) {
  const orderId = String(formData.get("orderId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (status !== "paid") throw new Error("Esta alteração de pagamento não está disponível por esta ação.");
  await PaymentService.confirmDefaultForOrder(orderId);
  scheduleOrderWhatsAppNotifications("payment.paid");
  refreshOrder(orderId);
}
export async function transitionFulfillmentAction(formData: FormData) {
  const orderId = String(formData.get("orderId") ?? "");
  const status = String(formData.get("status") ?? "") as FulfillmentStatus;
  if (["awaiting_assignment","assigned","picked_up","out_for_delivery","delivered"].includes(status)) {
    throw new Error("Atualize as etapas da entrega pela Central de Entregas.");
  }
  await OrderService.setFulfillment(orderId, status);
  scheduleOrderWhatsAppNotifications(`fulfillment.${status}`);
  refreshOrder(orderId);
}

const managerIntentSchema = z.enum([
  "accept", "reject", "cancel", "start_production", "mark_ready", "mark_paid",
  "await_pickup", "customer_picked_up", "await_courier", "served", "complete", "reprint",
]);

export type OrderManagerActionState = { ok: boolean; message: string | null; error: string | null };

export async function orderManagerAction(_previousState: OrderManagerActionState, formData: FormData): Promise<OrderManagerActionState> {
  const orderId = String(formData.get("orderId") ?? "");
  const parsed = managerIntentSchema.safeParse(String(formData.get("intent") ?? ""));
  if (!parsed.success) return { ok: false, message: null, error: "Esta ação não está disponível para o pedido." };

  try {
    switch (parsed.data) {
      case "accept": await OrderService.confirm(orderId); break;
      case "reject": await OrderService.reject(orderId, String(formData.get("reason") ?? "")); break;
      case "cancel": await OrderService.cancel(orderId, String(formData.get("reason") ?? "")); break;
      case "start_production": await OrderService.startProduction(orderId); break;
      case "mark_ready": await OrderService.setProduction(orderId, "ready"); break;
      case "mark_paid": await PaymentService.confirmDefaultForOrder(orderId); break;
      case "await_pickup": await OrderService.setFulfillment(orderId, "awaiting_pickup"); break;
      case "customer_picked_up": await OrderService.setFulfillment(orderId, "picked_up_by_customer"); break;
      case "await_courier": await DeliveryOperationsService.markWaiting(orderId); break;
      case "served": await OrderService.setFulfillment(orderId, "served"); break;
      case "complete": await OrderService.complete(orderId); break;
      case "reprint": {
        const printJobId = String(formData.get("printJobId") ?? "");
        const reason = String(formData.get("reason") ?? "");
        await PrintQueueService.reprint(printJobId, reason);
        break;
      }
    }
    if (parsed.data !== "reprint") scheduleOrderWhatsAppNotifications(`order_manager.${parsed.data}`);
    refreshOrder(orderId);
    const labels: Record<z.infer<typeof managerIntentSchema>, string> = {
      accept: "Pedido aceito.", reject: "Pedido rejeitado.", cancel: "Pedido cancelado.", start_production: "Produção iniciada.",
      mark_ready: "Pedido marcado como pronto.", mark_paid: "Pagamento confirmado.",
      await_pickup: "Pedido liberado para retirada.", customer_picked_up: "Retirada confirmada.",
      await_courier: "Pedido enviado para a central de entregas.", served: "Atendimento de balcão concluído.",
      complete: "Pedido concluído.", reprint: "Reimpressão solicitada.",
    };
    return { ok: true, message: labels[parsed.data], error: null };
  } catch (error) {
    refreshOrder(orderId);
    return { ok: false, message: null, error: friendlyOrderActionError(error) };
  }
}
