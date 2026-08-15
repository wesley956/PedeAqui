"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { cartCookieName } from "@/server/cart/cart-token";
import { CustomerRecognitionService } from "@/server/customers/recognition-service";
import { CUSTOMER_RECOGNITION_MAX_AGE_SECONDS, customerRecognitionCookieName } from "@/server/customers/recognition-token";
import { orderCookieName } from "@/server/orders/order-token";
import { OrderService } from "@/server/orders/order-service";
import { logger } from "@/server/observability/logger";
import { PaymentService } from "@/server/payments/payment-service";
import { PrintQueueService } from "@/server/printing/print-queue-service";
import { DeliveryOperationsService } from "@/server/delivery/delivery-operations-service";
import type { FulfillmentStatus, ProductionStatus } from "@/server/orders/state-machines";

export async function createOrderFromCheckoutAction(formData: FormData) {
  const storeSlug = String(formData.get("storeSlug") ?? "");
  const cookieStore = await cookies();
  const cartCookie = cartCookieName(storeSlug);
  const token = cookieStore.get(cartCookie)?.value;
  if (!token) redirect(`/m/${storeSlug}/carrinho`);

  const result = await OrderService.createFromCheckout(storeSlug, token);
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
  refreshOrder(orderId);
}
export async function confirmOrderAction(formData: FormData) {
  const orderId = String(formData.get("orderId") ?? "");
  await OrderService.confirm(orderId);
  refreshOrder(orderId);
}
export async function transitionProductionAction(formData: FormData) {
  const orderId = String(formData.get("orderId") ?? "");
  const status = String(formData.get("status") ?? "") as ProductionStatus;
  await OrderService.setProduction(orderId, status);
  refreshOrder(orderId);
}
export async function transitionPaymentAction(formData: FormData) {
  const orderId = String(formData.get("orderId") ?? "");
  const status = String(formData.get("status") ?? "");
  if (status !== "paid") throw new Error("Payment state must be changed through PaymentService");
  await PaymentService.confirmDefaultForOrder(orderId);
  refreshOrder(orderId);
}
export async function transitionFulfillmentAction(formData: FormData) {
  const orderId = String(formData.get("orderId") ?? "");
  const status = String(formData.get("status") ?? "") as FulfillmentStatus;
  if (["awaiting_assignment","assigned","picked_up","out_for_delivery","delivered"].includes(status)) {
    throw new Error("Delivery fulfillment must be changed through DeliveryOperationsService");
  }
  await OrderService.setFulfillment(orderId, status);
  refreshOrder(orderId);
}

const managerIntentSchema = z.enum([
  "accept", "reject", "start_production", "mark_ready", "mark_paid",
  "await_pickup", "customer_picked_up", "await_courier", "served", "complete", "reprint",
]);

export type OrderManagerActionState = { ok: boolean; message: string | null; error: string | null };

export async function orderManagerAction(_previousState: OrderManagerActionState, formData: FormData): Promise<OrderManagerActionState> {
  const orderId = String(formData.get("orderId") ?? "");
  const parsed = managerIntentSchema.safeParse(String(formData.get("intent") ?? ""));
  if (!parsed.success) return { ok: false, message: null, error: "Ação operacional inválida." };

  try {
    switch (parsed.data) {
      case "accept": await OrderService.confirm(orderId); break;
      case "reject": await OrderService.reject(orderId, String(formData.get("reason") ?? "")); break;
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
    refreshOrder(orderId);
    const labels: Record<z.infer<typeof managerIntentSchema>, string> = {
      accept: "Pedido aceito.", reject: "Pedido rejeitado.", start_production: "Produção iniciada.",
      mark_ready: "Pedido marcado como pronto.", mark_paid: "Pagamento confirmado no ledger.",
      await_pickup: "Pedido liberado para retirada.", customer_picked_up: "Retirada confirmada.",
      await_courier: "Pedido enviado para a fila de entregas.", served: "Atendimento de balcão concluído.",
      complete: "Pedido concluído.", reprint: "Reimpressão enviada para a fila.",
    };
    return { ok: true, message: labels[parsed.data], error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível executar a ação.";
    return { ok: false, message: null, error: message };
  }
}
