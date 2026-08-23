"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { CartService } from "@/server/cart/cart-service";
import { cartCookieName } from "@/server/cart/cart-token";
import { ComplementCategoryService } from "@/server/menu/complement-category-service";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function saveComplementCategoriesAction(formData: FormData) {
  const categoryIds = formData.getAll("categoryId").filter((value): value is string => typeof value === "string" && uuidPattern.test(value));
  const rows = categoryIds.map((categoryId) => {
    const rawOrder = formData.get(`order_${categoryId}`);
    return { categoryId, sortOrder: typeof rawOrder === "string" && Number.isInteger(Number(rawOrder)) ? Number(rawOrder) : 0 };
  });
  await ComplementCategoryService.replaceSettings(rows);
  revalidatePath("/cardapio/sugestoes");
  return { ok: true, message: rows.length === 0 ? "Sugestões desativadas." : "Categorias sugeridas atualizadas." };
}

export async function addSimpleComplementAction(storeSlug: string, productId: string) {
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(storeSlug) || !uuidPattern.test(productId)) return { ok: false, message: "Item inválido." };
  const categories = await ComplementCategoryService.loadPublic(storeSlug, null, 12);
  const product = categories.flatMap((category) => category.products).find((item) => item.id === productId);
  if (!product) return { ok: false, message: "Este complemento não está disponível." };
  if (product.requiresConfiguration) return { ok: false, message: "Escolha as opções deste item antes de adicionar." };
  const cookieStore = await cookies();
  const cookieName = cartCookieName(storeSlug);
  const existingToken = cookieStore.get(cookieName)?.value ?? null;
  try {
    const result = await CartService.addItem({ storeSlug, productId, quantity: 1, note: null, modifierIds: [], modifierSelections: [], gasSaleMode: null }, existingToken);
    if (!existingToken) cookieStore.set(cookieName, result.token, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: `/m/${result.store.slug}`, maxAge: 7 * 24 * 60 * 60 });
    const refreshed = await CartService.getCart(storeSlug, result.token);
    return { ok: true, message: `${product.name} adicionado.`, totalCents: Number(refreshed.cart?.total_cents ?? 0) };
  } catch {
    return { ok: false, message: "Não foi possível adicionar este complemento agora." };
  }
}
