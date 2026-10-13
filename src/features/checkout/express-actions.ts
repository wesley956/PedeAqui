"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { removeCartItemAction, updateCartQuantityAction } from "@/features/cart/actions";
import { applyCheckoutBenefitsAction, clearCheckoutBenefitsAction } from "@/features/checkout/benefit-actions";
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

async function context(formData: FormData) {
  const storeSlug = text(formData, "storeSlug");
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(storeSlug)) redirect("/");
  const cookieStore = await cookies();
  const token = cookieStore.get(cartCookieName(storeSlug))?.value;
  if (!token) redirect(`/m/${storeSlug}`);
  const recognitionToken = cookieStore.get(customerRecognitionCookieName(storeSlug))?.value ?? null;
  return { storeSlug, token, recognitionToken };
}

type Step = () => Promise<unknown>;

/**
 * Salva cada parte do formulário único na mesma sessão de checkout usada antes,
 * com as mesmas validações do servidor. No modo "draft" (trocar quantidade, aplicar cupom)
 * guarda o que já está válido e ignora o resto, para o cliente não perder o que digitou.
 */
async function saveParts(formData: FormData, mode: "strict" | "draft") {
  const { storeSlug, token, recognitionToken } = await context(formData);
  const fulfillment = text(formData, "fulfillmentType") === "pickup" ? "pickup" : "delivery";
  const rawPayment = text(formData, "paymentMethod");
  const customMatch = rawPayment.match(/^custom:([0-9a-f-]{36})$/i);
  const method = (customMatch ? "custom" : rawPayment) as "cash" | "pix" | "credit_card" | "debit_card" | "custom";
  const savedIndex = text(formData, "savedAddressIndex");

  const steps: Step[] = [
    () => CheckoutService.saveFulfillment(storeSlug, token, fulfillment),
    () => CheckoutService.saveIdentity(storeSlug, token, { name: text(formData, "name"), phone: text(formData, "phone"), email: optional(formData, "email") }),
  ];
  if (fulfillment === "delivery") {
    steps.push(savedIndex !== "" && savedIndex !== "new"
      ? () => {
        // Chamado via referência para não ser confundido com um hook do React pelo lint.
        const applyRecognizedAddress = CheckoutService.useRecognizedAddress;
        return applyRecognizedAddress.call(CheckoutService, storeSlug, token, recognitionToken, Number(savedIndex));
      }
      : () => CheckoutService.saveAddress(storeSlug, token, {
        neighborhoodId: optional(formData, "neighborhoodId"),
        postalCode: text(formData, "postalCode"),
        street: text(formData, "street"),
        number: text(formData, "number"),
        complement: optional(formData, "complement"),
        district: text(formData, "district"),
        city: text(formData, "city"),
        state: text(formData, "state"),
        reference: optional(formData, "reference"),
      }));
  }
  steps.push(async () => {
    if (!rawPayment) throw new CheckoutError("invalid_payment", "Escolha como vai pagar");
    let cashChangeForCents: number | null = null;
    const rawChange = method === "cash" && formData.get("needsChange") === "yes" ? optional(formData, "changeFor") : null;
    if (rawChange) {
      try { cashChangeForCents = parseMoneyToCents(rawChange); } catch { throw new CheckoutError("invalid_change", "Informe um valor válido para o troco"); }
    }
    return CheckoutService.savePayment(storeSlug, token, { method, customPaymentMethodId: customMatch?.[1] ?? null, cashChangeForCents });
  });
  steps.push(() => CheckoutService.saveSchedule(storeSlug, token, text(formData, "when") === "scheduled"
    ? { mode: "scheduled", localDateTime: text(formData, "localDateTime") }
    : { mode: "asap" }));

  for (const step of steps) {
    try {
      await step();
    } catch (error) {
      if (!(error instanceof CheckoutError)) throw error;
      if (mode === "strict") back(storeSlug, error.code);
    }
  }
  return { storeSlug, token, recognitionToken };
}

/**
 * Checkout Expresso: uma tela, um botão. Salva tudo e só então confirma o pedido.
 * Se a taxa de entrega acabou de ser calculada e o cliente ainda não viu o total final,
 * volta para a tela com o total atualizado em vez de confirmar.
 */
export async function submitExpressCheckoutAction(formData: FormData) {
  const { storeSlug, token, recognitionToken } = await saveParts(formData, "strict");
  // O cliente confirma o valor que viu. Se a entrega mudou o total, mostra o novo total antes de confirmar.
  const current = await CheckoutService.load(storeSlug, token, recognitionToken);
  const expected = Number(text(formData, "expectedTotalCents"));
  if (!Number.isFinite(expected) || expected !== Number(current.cart.total_cents)) back(storeSlug, "total_updated");
  await confirmCheckoutOrderAction(formData);
}

/** − / + / remover item no topo do checkout, guardando antes o que o cliente já preencheu. */
export async function expressItemAction(formData: FormData) {
  const { storeSlug } = await saveParts(formData, "draft");
  const [kind, itemId, quantity] = text(formData, "itemAction").split(":");
  const next = new FormData();
  next.set("storeSlug", storeSlug);
  next.set("itemId", itemId ?? "");
  next.set("returnTo", "checkout");
  if (kind === "remove") await removeCartItemAction(next);
  next.set("quantity", quantity ?? "1");
  await updateCartQuantityAction(next);
}

/** Aplicar cupom/benefício sem perder o que já foi preenchido. */
export async function expressApplyBenefitsAction(formData: FormData) {
  await saveParts(formData, "draft");
  await applyCheckoutBenefitsAction(formData);
}

export async function expressClearBenefitsAction(formData: FormData) {
  await saveParts(formData, "draft");
  await clearCheckoutBenefitsAction(formData);
}
