"use server";

import { redirect } from "next/navigation";
import { createOrderFromCheckoutAction } from "@/features/orders/actions";
import { CheckoutError } from "@/server/checkout/checkout-service";

export async function confirmCheckoutOrderAction(formData: FormData) {
  const storeSlug = String(formData.get("storeSlug") ?? "");
  try {
    await createOrderFromCheckoutAction(formData);
  } catch (error) {
    if (error instanceof CheckoutError) {
      redirect(`/m/${storeSlug}/checkout?erro=${encodeURIComponent(error.code)}`);
    }
    throw error;
  }
}
