"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cartCookieName } from "@/server/cart/cart-token";
import { OrderService } from "@/server/orders/order-service";
import type { FulfillmentStatus, PaymentStatus, ProductionStatus } from "@/server/orders/state-machines";

export async function createOrderFromCheckoutAction(formData: FormData) {
  const storeSlug = String(formData.get("storeSlug") ?? "");
  const token = (await cookies()).get(cartCookieName(storeSlug))?.value;
  if (!token) redirect(`/m/${storeSlug}/carrinho`);
  const result = await OrderService.createFromCheckout(storeSlug, token);
  redirect(`/m/${storeSlug}/pedido/${result.order_id}`);
}

export async function cancelOrderAction(formData: FormData) {
  const orderId = String(formData.get("orderId") ?? "");
  const reason = String(formData.get("reason") ?? "");
  await OrderService.cancel(orderId, reason);
  revalidatePath("/pedidos");
  revalidatePath(`/pedidos/${orderId}`);
}

export async function confirmOrderAction(formData: FormData) {
  const orderId = String(formData.get("orderId") ?? "");
  await OrderService.confirm(orderId);
  revalidatePath("/pedidos");
  revalidatePath(`/pedidos/${orderId}`);
}

export async function transitionProductionAction(formData: FormData) {
  const orderId = String(formData.get("orderId") ?? "");
  const status = String(formData.get("status") ?? "") as ProductionStatus;
  await OrderService.setProduction(orderId, status);
  revalidatePath("/pedidos");
  revalidatePath(`/pedidos/${orderId}`);
}

export async function transitionPaymentAction(formData: FormData) {
  const orderId = String(formData.get("orderId") ?? "");
  const status = String(formData.get("status") ?? "") as PaymentStatus;
  await OrderService.setPayment(orderId, status);
  revalidatePath("/pedidos");
  revalidatePath(`/pedidos/${orderId}`);
}

export async function transitionFulfillmentAction(formData: FormData) {
  const orderId = String(formData.get("orderId") ?? "");
  const status = String(formData.get("status") ?? "") as FulfillmentStatus;
  await OrderService.setFulfillment(orderId, status);
  revalidatePath("/pedidos");
  revalidatePath(`/pedidos/${orderId}`);
}
