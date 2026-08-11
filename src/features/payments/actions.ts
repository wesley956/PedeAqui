"use server";

import { revalidatePath } from "next/cache";
import { StorePaymentMethodService } from "@/server/payments/store-payment-method-service";
import { paymentMethodSchema } from "@/server/checkout/schemas";

export async function savePaymentMethodsAction(formData: FormData) {
  const methods = formData.getAll("method").map((value) => paymentMethodSchema.parse(String(value)));
  await StorePaymentMethodService.save(methods);
  revalidatePath("/configuracoes/pagamentos");
  revalidatePath("/m/[slug]/checkout", "page");
}
