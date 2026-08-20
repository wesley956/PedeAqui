"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CartService } from "@/server/cart/cart-service";
import { cartCookieName } from "@/server/cart/cart-token";
import { addCartItemSchema, cartItemQuantitySchema, removeCartItemSchema } from "@/server/cart/schemas";
import { PricingError } from "@/server/pricing/pricing-service";

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
  const gasSaleModeRaw = formData.get("gasSaleMode");
  const values = addCartItemSchema.parse({
    storeSlug: String(formData.get("storeSlug") ?? ""),
    productId: String(formData.get("productId") ?? ""),
    quantity: safeInteger(formData.get("quantity")),
    note: typeof formData.get("note") === "string" ? String(formData.get("note")) : null,
    modifierIds: selectedModifierIds(formData),
    gasSaleMode: typeof gasSaleModeRaw === "string" && gasSaleModeRaw ? gasSaleModeRaw : null,
  });
  const cookieName = cartCookieName(values.storeSlug);
  const cookieStore = await cookies();
  const existingToken = cookieStore.get(cookieName)?.value ?? null;

  let result: Awaited<ReturnType<typeof CartService.addItem>>;
  try {
    result = await CartService.addItem(values, existingToken);
  } catch (error) {
    if (error instanceof PricingError) {
      redirect(`/m/${values.storeSlug}/produto/${values.productId}?erro=${error.code}`);
    }
    throw error;
  }

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
