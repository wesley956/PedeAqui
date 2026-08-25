"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CartService } from "@/server/cart/cart-service";
import { CartItemEditService } from "@/server/cart/cart-item-edit-service";
import { cartCookieName } from "@/server/cart/cart-token";
import { addCartItemSchema, cartItemQuantitySchema, removeCartItemSchema } from "@/server/cart/schemas";
import { PricingError } from "@/server/pricing/pricing-service";
import { logger } from "@/server/observability/logger";

const legacyModifierFieldPattern = /^modifier_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function selectedModifierIds(formData: FormData) {
  const ids: string[] = [];
  for (const [key, value] of formData.entries()) {
    if (legacyModifierFieldPattern.test(key) && typeof value === "string" && value) ids.push(value);
  }
  return ids;
}

function quantityModifierSelections(formData: FormData) {
  const selections: Array<{ modifierId: string; quantity: number }> = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("modifier_qty_") || typeof value !== "string") continue;
    const modifierId = key.slice("modifier_qty_".length);
    const quantity = Number(value);
    if (quantity > 0) selections.push({ modifierId, quantity });
  }
  return selections;
}

function safeInteger(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return Number.NaN;
  return Number(value);
}

function safePublicPath(storeSlug: string, suffix = "") {
  return /^[a-z0-9][a-z0-9-]{1,62}$/.test(storeSlug) ? `/m/${storeSlug}${suffix}` : "/";
}

function safeUuid(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) return null;
  return value;
}

export async function addToCartAction(formData: FormData) {
  const rawStoreSlug = String(formData.get("storeSlug") ?? "");
  const rawProductId = String(formData.get("productId") ?? "");
  const rawCartItemId = formData.get("cartItemId");
  const editItemId = rawCartItemId ? safeUuid(rawCartItemId) : null;
  const gasSaleModeRaw = formData.get("gasSaleMode");
  const legacyModifierIds = selectedModifierIds(formData);
  const parsed = addCartItemSchema.safeParse({
    storeSlug: rawStoreSlug,
    productId: rawProductId,
    quantity: safeInteger(formData.get("quantity")),
    note: typeof formData.get("note") === "string" ? String(formData.get("note")) : null,
    modifierIds: legacyModifierIds,
    modifierSelections: [
      ...legacyModifierIds.map((modifierId) => ({ modifierId, quantity: 1 })),
      ...quantityModifierSelections(formData),
    ],
    gasSaleMode: typeof gasSaleModeRaw === "string" && gasSaleModeRaw ? gasSaleModeRaw : null,
  });
  if (!parsed.success || (rawCartItemId && !editItemId)) {
    const safeSlug = /^[a-z0-9][a-z0-9-]{1,62}$/.test(rawStoreSlug) ? rawStoreSlug : null;
    const safeProduct = /^[0-9a-f-]{36}$/i.test(rawProductId) ? rawProductId : null;
    redirect(safeSlug && safeProduct ? `/m/${safeSlug}/produto/${safeProduct}?erro=invalid_item` : "/");
  }
  const values = parsed.data;
  const cookieName = cartCookieName(values.storeSlug);
  const cookieStore = await cookies();
  const existingToken = cookieStore.get(cookieName)?.value ?? null;

  if (editItemId) {
    if (!existingToken) redirect(`/m/${values.storeSlug}/carrinho?erro=cart_edit_failed`);
    try {
      await CartItemEditService.replaceItem(values, existingToken, editItemId);
    } catch (error) {
      if (error instanceof PricingError) {
        redirect(`/m/${values.storeSlug}/produto/${values.productId}?editar=${editItemId}&erro=${error.code}`);
      }
      logger.error("public_cart_edit_failed", { errorType: error instanceof Error ? error.name : "unknown" });
      redirect(`/m/${values.storeSlug}/produto/${values.productId}?editar=${editItemId}&erro=cart_edit_failed`);
    }
    redirect(`/m/${values.storeSlug}/carrinho`);
  }

  let result: Awaited<ReturnType<typeof CartService.addItem>>;
  try {
    result = await CartService.addItem(values, existingToken);
  } catch (error) {
    if (error instanceof PricingError) {
      redirect(`/m/${values.storeSlug}/produto/${values.productId}?erro=${error.code}`);
    }
    logger.error("public_cart_add_failed", { errorType: error instanceof Error ? error.name : "unknown" });
    redirect(`/m/${values.storeSlug}/produto/${values.productId}?erro=cart_add_failed`);
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
  const rawStoreSlug = String(formData.get("storeSlug") ?? "");
  const parsed = cartItemQuantitySchema.safeParse({
    storeSlug: rawStoreSlug,
    itemId: String(formData.get("itemId") ?? ""),
    quantity: safeInteger(formData.get("quantity")),
  });
  if (!parsed.success) redirect(safePublicPath(rawStoreSlug, "/carrinho?erro=invalid_quantity"));
  const values = parsed.data;
  const token = (await cookies()).get(cartCookieName(values.storeSlug))?.value;
  if (!token) redirect(`/m/${values.storeSlug}`);
  try {
    await CartService.updateQuantity(values.storeSlug, token, values.itemId, values.quantity);
  } catch (error) {
    logger.error("public_cart_quantity_failed", { errorType: error instanceof Error ? error.name : "unknown" });
    redirect(`/m/${values.storeSlug}/carrinho?erro=cart_update_failed`);
  }
  redirect(`/m/${values.storeSlug}/carrinho`);
}

export async function removeCartItemAction(formData: FormData) {
  const rawStoreSlug = String(formData.get("storeSlug") ?? "");
  const parsed = removeCartItemSchema.safeParse({ storeSlug: rawStoreSlug, itemId: String(formData.get("itemId") ?? "") });
  if (!parsed.success) redirect(safePublicPath(rawStoreSlug, "/carrinho?erro=cart_remove_failed"));
  const values = parsed.data;
  const token = (await cookies()).get(cartCookieName(values.storeSlug))?.value;
  if (!token) redirect(`/m/${values.storeSlug}`);
  try {
    await CartService.removeItem(values.storeSlug, token, values.itemId);
  } catch (error) {
    logger.error("public_cart_remove_failed", { errorType: error instanceof Error ? error.name : "unknown" });
    redirect(`/m/${values.storeSlug}/carrinho?erro=cart_remove_failed`);
  }
  redirect(`/m/${values.storeSlug}/carrinho`);
}
