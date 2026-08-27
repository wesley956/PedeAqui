"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cartCookieName } from "@/server/cart/cart-token";
import { CartService } from "@/server/cart/cart-service";
import { parseMoneyToCents } from "@/server/catalog/money";
import { GrowthService } from "@/server/growth/growth-service";
import { StoreModuleStateService } from "@/server/modules/store-module-state-service";

function optional(formData: FormData, key: string) {
  const value = String(formData.get(key) ?? "").trim();
  return value || null;
}

function optionalPositiveInt(formData: FormData, key: string) {
  const value = optional(formData, key);
  if (!value) return undefined;
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : undefined;
}

function optionalMoney(formData: FormData, key: string) {
  const value = optional(formData, key);
  return value ? parseMoneyToCents(value) : undefined;
}

async function publicContext(storeSlug: string) {
  const token = (await cookies()).get(cartCookieName(storeSlug))?.value ?? null;
  if (!token) redirect(`/m/${storeSlug}/carrinho`);
  const current = await CartService.getCart(storeSlug, token);
  if (!current.cart || !("store" in current) || !current.store) redirect(`/m/${storeSlug}/carrinho`);
  const enabled = await StoreModuleStateService.isEnabled(
    current.store.organization_id,
    current.store.id,
    "growth",
  );
  if (!enabled) redirect(`/m/${storeSlug}/checkout?erro=benefit_unavailable`);
  return { token };
}

export async function applyCheckoutBenefitsAction(formData: FormData) {
  const storeSlug = String(formData.get("storeSlug") ?? "");
  const { token } = await publicContext(storeSlug);
  try {
    await GrowthService.applyCartBenefits(storeSlug, token, {
      couponCode: optional(formData, "couponCode"),
      cashbackRedeemCents: optionalMoney(formData, "cashbackAmount") ?? 0,
      loyaltyRedeemPoints: optionalPositiveInt(formData, "loyaltyPoints") ?? 0,
    });
  } catch {
    redirect(`/m/${storeSlug}/checkout?erro=benefit_invalid`);
  }
  redirect(`/m/${storeSlug}/checkout`);
}

export async function clearCheckoutBenefitsAction(formData: FormData) {
  const storeSlug = String(formData.get("storeSlug") ?? "");
  const { token } = await publicContext(storeSlug);
  await GrowthService.clearCartBenefits(storeSlug, token);
  redirect(`/m/${storeSlug}/checkout`);
}
