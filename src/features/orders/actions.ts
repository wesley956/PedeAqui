"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { cartCookieName } from "@/server/cart/cart-token";
import { OrderNotificationContextService } from "@/server/conversations/order-notification-context-service";
import { scheduleOrderWhatsAppNotifications } from "@/server/conversations/order-notification-dispatch";
import { CustomerRecognitionService } from "@/server/customers/recognition-service";
import { CUSTOMER_RECOGNITION_MAX_AGE_SECONDS, customerRecognitionCookieName } from "@/server/customers/recognition-token";
import { IfoodOrderLifecycleService } from "@/server/integrations/providers/ifood/ifood-order-lifecycle-service";
import { orderCookieName } from "@/server/orders/order-token";
import { routeOrderManagerLifecycle } from "@/server/orders/order-manager-lifecycle-router";
import { OrderQuickFinishService } from "@/server/orders/order-quick-finish-service";
import { OrderService } from "@/server/orders/order-service";
import { logger } from "@/server/observability/logger";
import { scheduleOrderPixCharge } from "@/server/payments/order-pix-dispatch";
import { PaymentService } from "@/server/payments/payment-service";
import { PrintQueueService } from "@/server/printing/print-queue-service";
import { PrintService } from "@/server/printing/print-service";
import { DeliveryOperationsService } from "@/server/delivery/delivery-operations-service";
import { ManualDeliveryService } from "@/server/delivery/manual-delivery-service";
import type { FulfillmentStatus, ProductionStatus } from "@/server/orders/state-machines";
import { friendlyOrderActionError } from "@/features/orders/order-action-error";
import { getAccessContext } from "@/server/access/context";
import { ProductExperienceService } from "@/server/product-experience/product-experience-service";

function scheduleOrderActionTelemetry(
  orderId: string,
  action: string,
  startedAt: number,
  outcome: "success" | "failure",
) {
  after(async () => {
    try {
      const context = await getAccessContext();
      await ProductExperienceService.capture(context, {
        eventName: "px.order.action",
        orderId,
        outcome,
        durationMs: Date.now() - startedAt,
        source: "server",
        metadata: { action, surface: "order_manager", result: outcome },
      });
    } catch {
      // The action has already finished; telemetry is never authoritative.
    }
  });
}

export async function createOrderFromCheckoutAction(formData: FormData) {
  const storeSlug = String(formData.get("storeSlug") ?? "");
  const cookieStore = await cookies();
  const cartCookie = cartCookieName(storeSlug);
  const token = cookieStore.get(cartCookie)?.value;
  if (!token) redirect(`/m/${storeSlug}/carrinho`);

  const result = await OrderService.createFromCheckout(storeSlug, token);
  await OrderNotificationContextService.capture(result.order_id, result.accessToken);
  scheduleOrderWhatsAppNotifications("checkout.order_created");
  scheduleOrderPixCharge(result.order_id);
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
  revalidatePath("/movimento");
}

export async function cancelOrderAction(formData: FormData) {
  const orderId = String(formData.get("orderId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  const routed = await routeOrderManagerLifecycle({ orderId, intent: "cancel", reason });
  if (!routed.external) scheduleOrderWhatsAppNotifications("order.canceled");
  refreshOrder(orderId);
}
export async function confirmOrderAction(formData: FormData) {
  const orderId = String(formData.get("orderId") ?? "");
  const routed = await routeOrderManagerLifecycle({ orderId, intent: "accept" });
  if (!routed.external) scheduleOrderWhatsAppNotifications("order.confirmed");
  refreshOrder(orderId);
}
export async function transitionProductionAction(formData: FormData) {
  const orderId = String(formData.get("orderId") ?? "");
  const status = String(formData.get("status") ?? "") as ProductionStatus;
  if (status === "preparing") {
    const routed = await routeOrderManagerLifecycle({ orderId, intent: "start_production" });
    if (!routed.external) scheduleOrderWhatsAppNotifications(`production.${status}`);
  } else if (status === "ready") {
    const routed = await routeOrderManagerLifecycle({ orderId, intent: "mark_ready" });
    if (!routed.external) scheduleOrderWhatsAppNotifications(`production.${status}`);
  } else {
    await OrderService.setProduction(orderId, status);
    scheduleOrderWhatsAppNotifications(`production.${status}`);
  }
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

export type ExternalCancellationReasonsState = {
  external: boolean;
  reasons: Array<{ code: string; description: string }>;
  error: string | null;
};

export async function getExternalCancellationReasonsAction(orderId: string): Promise<ExternalCancellationReasonsState> {
  try {
    const reasons = await IfoodOrderLifecycleService.cancellationReasonsIfExternal(orderId);
    return { external: reasons !== null, reasons: reasons ?? [], error: null };
  } catch (error) {
    return { external: true, reasons: [], error: friendlyOrderActionError(error) };
  }
}

const managerIntentSchema = z.enum([
  "accept", "reject", "cancel", "accept_and_start", "start_production", "mark_ready", "mark_paid", "mark_paid_and_complete",
  "await_pickup", "customer_picked_up", "await_courier", "manual_out_for_delivery", "manual_finish_delivery",
  "served", "complete", "quick_finish", "print", "reprint",
]);

export type OrderManagerActionState = { ok: boolean; message: string | null; error: string | null };

export async function orderManagerAction(_previousState: OrderManagerActionState, formData: FormData): Promise<OrderManagerActionState> {
  const startedAt = Date.now();
  const orderId = String(formData.get("orderId") ?? "");
  const parsed = managerIntentSchema.safeParse(String(formData.get("intent") ?? ""));
  if (!parsed.success) return { ok: false, message: null, error: "Esta ação não está disponível para o pedido." };

  try {
    let message: string | null = null;
    let externalLifecycleCommand = false;
    switch (parsed.data) {
      case "accept":
      case "accept_and_start":
      case "reject":
      case "cancel":
      case "start_production":
      case "mark_ready": {
        const routed = await routeOrderManagerLifecycle({
          orderId,
          intent: parsed.data,
          reason: String(formData.get("reason") ?? ""),
        });
        externalLifecycleCommand = routed.external;
        message = routed.message;
        break;
      }
      case "mark_paid": await PaymentService.confirmDefaultForOrder(orderId); break;
      case "mark_paid_and_complete": {
        await PaymentService.confirmDefaultForOrder(orderId);
        await OrderService.complete(orderId);
        break;
      }
      case "await_pickup": await OrderService.setFulfillment(orderId, "awaiting_pickup"); break;
      case "customer_picked_up": await OrderService.setFulfillment(orderId, "picked_up_by_customer"); break;
      case "await_courier": await DeliveryOperationsService.markWaiting(orderId); break;
      case "manual_out_for_delivery": {
        await ManualDeliveryService.dispatch(orderId);
        scheduleOrderWhatsAppNotifications("delivery.out_for_delivery");
        message = "Pedido marcado como saiu para entrega.";
        break;
      }
      case "manual_finish_delivery": {
        const result = await ManualDeliveryService.finish(orderId, formData.get("paymentReceived") === "yes");
        scheduleOrderWhatsAppNotifications("delivery.delivered");
        if (result.paymentConfirmed) scheduleOrderWhatsAppNotifications("payment.paid");
        if (result.completed) {
          message = "Entrega confirmada e pedido finalizado.";
        } else if (result.paymentIssue) {
          message = "Entrega confirmada. O pagamento precisa ser resolvido antes de finalizar.";
        } else if (result.paymentPending) {
          message = "Entrega confirmada. Confirme o pagamento para finalizar o pedido.";
        } else {
          message = "Entrega confirmada.";
        }
        break;
      }
      case "served": await OrderService.setFulfillment(orderId, "served"); break;
      case "complete": await OrderService.reconcileCompletion(orderId); break;
      case "quick_finish": {
        const result = await OrderQuickFinishService.finish(orderId, formData.get("paymentReceived") === "yes");
        message = result.message;
        break;
      }
      case "print": {
        const result = await PrintService.requestConfirmedOrderPrint(orderId);
        if (result.kind === "no_route") throw new Error("No active print routes");
        if (result.kind === "already_queued") message = "A impressão já está na fila.";
        else if (result.kind === "retried") message = result.count === 1 ? "Impressão reenviada para a fila." : `${result.count} impressões reenviadas para a fila.`;
        else if (result.kind === "reprinted") message = result.count === 1 ? "Reimpressão enviada para a fila." : `${result.count} reimpressões enviadas para a fila.`;
        else message = result.count === 1 ? "1 via enviada para impressão." : `${result.count} vias enviadas para impressão.`;
        break;
      }
      case "reprint": {
        const printJobId = String(formData.get("printJobId") ?? "");
        const reason = String(formData.get("reason") ?? "");
        await PrintQueueService.reprint(printJobId, reason);
        break;
      }
    }
    if (!externalLifecycleCommand && !["print", "reprint", "manual_out_for_delivery", "manual_finish_delivery"].includes(parsed.data)) {
      scheduleOrderWhatsAppNotifications(`order_manager.${parsed.data}`);
    }
    refreshOrder(orderId);
    scheduleOrderActionTelemetry(orderId, parsed.data, startedAt, "success");
    const labels: Record<z.infer<typeof managerIntentSchema>, string> = {
      accept: "Pedido aceito.", accept_and_start: "Pedido aceito e preparo iniciado.", reject: "Pedido rejeitado.", cancel: "Pedido cancelado.", start_production: "Produção iniciada.",
      mark_ready: "Pedido marcado como pronto.", mark_paid: "Pagamento confirmado.", mark_paid_and_complete: "Pagamento confirmado e pedido concluído.",
      await_pickup: "Pedido liberado para retirada.", customer_picked_up: "Retirada confirmada.",
      await_courier: "Pedido enviado para a central de entregas.",
      manual_out_for_delivery: "Pedido marcado como saiu para entrega.", manual_finish_delivery: "Entrega confirmada.",
      served: "Atendimento de balcão concluído.",
      complete: "Pedido reconciliado e concluído.", quick_finish: "Pedido finalizado.", print: "Pedido enviado para impressão.", reprint: "Reimpressão solicitada.",
    };
    return { ok: true, message: message ?? labels[parsed.data], error: null };
  } catch (error) {
    refreshOrder(orderId);
    scheduleOrderActionTelemetry(orderId, parsed.data, startedAt, "failure");
    return { ok: false, message: null, error: friendlyOrderActionError(error) };
  }
}
