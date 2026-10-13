"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { confirmCheckoutOrderAction } from "@/features/checkout/confirm-order-action";
import { cartCookieName } from "@/server/cart/cart-token";
import { parseMoneyToCents } from "@/server/catalog/money";
import { CheckoutError, CheckoutService } from "@/server/checkout/checkout-service";
import { customerRecognitionCookieName } from "@/server/customers/recognition-token";

function text(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function optional(formData: FormData, name: string) {
  return text(formData, name) || null;
}

function back(storeSlug: string, code: string): never {
  redirect(`/m/${storeSlug}/checkout?erro=${encodeURIComponent(code)}`);
}

/**
 * Checkout Expresso: uma tela, um botão. Salva cada parte na mesma sessão de checkout usada pelas
 * etapas (com as mesmas validações do servidor) e só então confirma o pedido.
 * Se a taxa de entrega acabou de ser calculada e o cliente ainda não viu o total final,
 * volta para a tela com o total atualizado em vez de confirmar.
 */
export async function submitExpressCheckoutAction(formData: FormData) {
  const storeSlug = text(formData, "storeSlug");
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(storeSlug)) redirect("/");
  const cookieStore = await cookies();
  const token = cookieStore.get(cartCookieName(storeSlug))?.value;
  if (!token) redirect(`/m/${storeSlug}`);
  const recognitionToken = cookieStore.get(customerRecognitionCookieName(storeSlug))?.value ?? null;

  const fulfillment = text(formData, "fulfillmentType") === "pickup" ? "pickup" : "delivery";
  const rawPayment = text(formData, "paymentMethod");
  const customMatch = rawPayment.match(/^custom:([0-9a-f-]{36})$/i);
  const method = (customMatch ? "custom" : rawPayment) as "cash" | "pix" | "credit_card" | "debit_card" | "custom";

  try {
    await CheckoutService.saveFulfillment(storeSlug, token, fulfillment);
    await CheckoutService.saveIdentity(storeSlug, token, {
      name: text(formData, "name"),
      phone: text(formData, "phone"),
      email: optional(formData, "email"),
    });

    if (fulfillment === "delivery") {
      const savedIndex = text(formData, "savedAddressIndex");
      if (savedIndex !== "" && savedIndex !== "new") {
        // Chamado via referência para não ser confundido com um hook do React pelo lint.
        const applyRecognizedAddress = CheckoutService.useRecognizedAddress;
        await applyRecognizedAddress.call(CheckoutService, storeSlug, token, recognitionToken, Number(savedIndex));
      } else {
        await CheckoutService.saveAddress(storeSlug, token, {
          neighborhoodId: optional(formData, "neighborhoodId"),
          postalCode: text(formData, "postalCode"),
          street: text(formData, "street"),
          number: text(formData, "number"),
          complement: optional(formData, "complement"),
          district: text(formData, "district"),
          city: text(formData, "city"),
          state: text(formData, "state"),
          reference: optional(formData, "reference"),
        });
      }
    }

    if (!rawPayment) throw new CheckoutError("invalid_payment", "Escolha como vai pagar");
    let cashChangeForCents: number | null = null;
    const rawChange = method === "cash" && formData.get("needsChange") === "yes" ? optional(formData, "changeFor") : null;
    if (rawChange) {
      try { cashChangeForCents = parseMoneyToCents(rawChange); } catch { throw new CheckoutError("invalid_change", "Informe um valor válido para o troco"); }
    }
    await CheckoutService.savePayment(storeSlug, token, { method, customPaymentMethodId: customMatch?.[1] ?? null, cashChangeForCents });

    const when = text(formData, "when");
    await CheckoutService.saveSchedule(storeSlug, token, when === "scheduled"
      ? { mode: "scheduled", localDateTime: text(formData, "localDateTime") }
      : { mode: "asap" });
  } catch (error) {
    if (error instanceof CheckoutError) back(storeSlug, error.code);
    throw error;
  }

  // O cliente confirma o valor que viu. Se a entrega mudou o total, mostra o novo total antes de confirmar.
  const current = await CheckoutService.load(storeSlug, token, recognitionToken);
  const expected = Number(text(formData, "expectedTotalCents"));
  if (!Number.isFinite(expected) || expected !== Number(current.cart.total_cents)) back(storeSlug, "total_updated");

  await confirmCheckoutOrderAction(formData);
}
