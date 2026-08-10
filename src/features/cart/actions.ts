"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CartService } from "@/server/cart/cart-service";
import { cartCookieName } from "@/server/cart/cart-token";
import { cartItemQuantitySchema, removeCartItemSchema } from "@/server/cart/schemas";

function selectedModifierIds(formData: FormData) {
  const ids: string[] = [];
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("modifier_") && typeof value === "string" && value) ids.push(value);
  }
  return ids;
}

function safeInteger(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return Number.NaN;
  return Number(value);
}

export async function addToCartAction(formData: FormData) {
  const storeSlug = String(formData.get("storeSlug") ?? "");
  const cookieName = cartCookieName(storeSlug);
  const cookieStore = await cookies();
  const existingToken = cookieStore.get(cookieName)?.value ?? null;

  const result = await CartService.addItem({
    storeSlug,
    productId: String(formData.get("productId") ?? ""),
    quantity: safeInteger(formData.get("quantity")),
    note: typeof formData.get("note") === "string" ? String(formData.get("note")) : null,
    modifierIds: selectedModifierIds(formData),
  }, existingToken);

  if (!existingToken) {
    cookieStore.set(cookieName, result.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: `/m/${result.store.slug}`,
      maxAge: 7 * 24 * 60 * 60,
    });
  }

  redirect(`/m/${result.store.slug}/carrinho`);
}

export async function updateCartQuantityAction(formData: FormData) {
  const values = cartItemQuantitySchema.parse({
    storeSlug: String(formData.get("storeSlug") ?? ""),
    itemId: String(formData.get("itemId") ?? ""),
    quantity: safeInteger(formData.get("quantity")),
  });
  const token = (await cookies()).get(cartCookieName(values.storeSlug))?.value;
  if (!token) redirect(`/m/${values.storeSlug}`);
  await CartService.updateQuantity(values.storeSlug, token, values.itemId, values.quantity);
  redirect(`/m/${values.storeSlug}/carrinho`);
}

export async function removeCartItemAction(formData: FormData) {
  const values = removeCartItemSchema.parse({
    storeSlug: String(formData.get("storeSlug") ?? ""),
    itemId: String(formData.get("itemId") ?? ""),
  });
  const token = (await cookies()).get(cartCookieName(values.storeSlug))?.value;
  if (!token) redirect(`/m/${values.storeSlug}`);
  await CartService.removeItem(values.storeSlug, token, values.itemId);
  redirect(`/m/${values.storeSlug}/carrinho`);
}
