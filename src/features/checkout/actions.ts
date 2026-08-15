"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cartCookieName } from "@/server/cart/cart-token";
import { parseMoneyToCents } from "@/server/catalog/money";
import { CheckoutError, CheckoutService } from "@/server/checkout/checkout-service";
import { customerRecognitionCookieName } from "@/server/customers/recognition-token";

async function tokenFor(storeSlug: string) {
  return (await cookies()).get(cartCookieName(storeSlug))?.value ?? null;
}

async function recognitionTokenFor(storeSlug: string) {
  return (await cookies()).get(customerRecognitionCookieName(storeSlug))?.value ?? null;
}

function errorRedirect(storeSlug: string, error: CheckoutError): never {
  redirect(`/m/${storeSlug}/checkout?erro=${encodeURIComponent(error.code)}`);
}

function optional(value: FormDataEntryValue | null) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function saveCheckoutIdentityAction(formData: FormData) {
  const storeSlug = String(formData.get("storeSlug") ?? "");
  const token = await tokenFor(storeSlug);
  if (!token) redirect(`/m/${storeSlug}/carrinho`);
  try {
    await CheckoutService.saveIdentity(storeSlug, token, {
      name: String(formData.get("name") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      email: optional(formData.get("email")),
    });
  } catch (error) {
    if (error instanceof CheckoutError) errorRedirect(storeSlug, error);
    throw error;
  }
  redirect(`/m/${storeSlug}/checkout`);
}

export async function saveCheckoutFulfillmentAction(formData: FormData) {
  const storeSlug = String(formData.get("storeSlug") ?? "");
  const token = await tokenFor(storeSlug);
  if (!token) redirect(`/m/${storeSlug}/carrinho`);
  try {
    await CheckoutService.saveFulfillment(storeSlug, token, String(formData.get("fulfillmentType") ?? "") as "delivery" | "pickup");
  } catch (error) {
    if (error instanceof CheckoutError) errorRedirect(storeSlug, error);
    throw error;
  }
  redirect(`/m/${storeSlug}/checkout`);
}

export async function saveCheckoutAddressAction(formData: FormData) {
  const storeSlug = String(formData.get("storeSlug") ?? "");
  const token = await tokenFor(storeSlug);
  if (!token) redirect(`/m/${storeSlug}/carrinho`);
  try {
    await CheckoutService.saveAddress(storeSlug, token, {
      postalCode: String(formData.get("postalCode") ?? ""),
      street: String(formData.get("street") ?? ""),
      number: String(formData.get("number") ?? ""),
      complement: optional(formData.get("complement")),
      district: String(formData.get("district") ?? ""),
      city: String(formData.get("city") ?? ""),
      state: String(formData.get("state") ?? ""),
      reference: optional(formData.get("reference")),
    });
  } catch (error) {
    if (error instanceof CheckoutError) errorRedirect(storeSlug, error);
    throw error;
  }
  redirect(`/m/${storeSlug}/checkout`);
}

export async function useSavedCheckoutAddressAction(formData: FormData) {
  const storeSlug = String(formData.get("storeSlug") ?? "");
  const token = await tokenFor(storeSlug);
  if (!token) redirect(`/m/${storeSlug}/carrinho`);
  const recognitionToken = await recognitionTokenFor(storeSlug);
  const addressIndex = Number(formData.get("addressIndex"));
  try {
    const applyRecognizedAddress = CheckoutService.useRecognizedAddress;
    await applyRecognizedAddress.call(CheckoutService, storeSlug, token, recognitionToken, addressIndex);
  } catch (error) {
    if (error instanceof CheckoutError) errorRedirect(storeSlug, error);
    throw error;
  }
  redirect(`/m/${storeSlug}/checkout`);
}

export async function saveCheckoutPaymentAction(formData: FormData) {
  const storeSlug = String(formData.get("storeSlug") ?? "");
  const token = await tokenFor(storeSlug);
  if (!token) redirect(`/m/${storeSlug}/carrinho`);
  const method = String(formData.get("paymentMethod") ?? "") as "cash" | "pix" | "credit_card" | "debit_card";
  const rawChange = optional(formData.get("changeFor"));
  let cashChangeForCents: number | null = null;
  if (method === "cash" && rawChange) cashChangeForCents = parseMoneyToCents(rawChange);
  try {
    await CheckoutService.savePayment(storeSlug, token, { method, cashChangeForCents });
  } catch (error) {
    if (error instanceof CheckoutError) errorRedirect(storeSlug, error);
    throw error;
  }
  redirect(`/m/${storeSlug}/checkout`);
}

export async function reviewCheckoutAction(formData: FormData) {
  const storeSlug = String(formData.get("storeSlug") ?? "");
  const token = await tokenFor(storeSlug);
  if (!token) redirect(`/m/${storeSlug}/carrinho`);
  redirect(`/m/${storeSlug}/checkout?revisar=1`);
}
