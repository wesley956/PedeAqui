import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { hashCartToken } from "@/server/cart/cart-token";

/** Item simples do carrinho (sem opções, observação ou vasilhame) que o cardápio pode ajustar com − e +. */
export type PublicCartQuickLine = { itemId: string; quantity: number };

export class PublicCartQuickLinesService {
  static async get(storeSlug: string, token?: string | null): Promise<Record<string, PublicCartQuickLine>> {
    if (!token) return {};
    const admin = createAdminClient();
    const { data: store, error: storeError } = await admin.from("stores")
      .select("id, organization_id")
      .ilike("slug", storeSlug)
      .in("status", ["active", "temporarily_closed"])
      .maybeSingle();
    if (storeError) throw storeError;
    if (!store) return {};

    const { data: cart, error: cartError } = await admin.from("carts")
      .select("id")
      .eq("organization_id", store.organization_id)
      .eq("store_id", store.id)
      .eq("token_hash", hashCartToken(token))
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (cartError) throw cartError;
    if (!cart) return {};

    const { data: items, error: itemsError } = await admin.from("cart_items")
      .select("id, product_id, quantity, note")
      .eq("organization_id", store.organization_id)
      .eq("store_id", store.id)
      .eq("cart_id", cart.id)
      .order("created_at");
    if (itemsError) throw itemsError;
    const plain = (items ?? []).filter((item) => !item.note);
    if (plain.length === 0) return {};

    const ids = plain.map((item) => item.id);
    const [modifiers, gas] = await Promise.all([
      admin.from("cart_item_modifiers").select("cart_item_id").in("cart_item_id", ids),
      admin.from("cart_item_gas_options").select("cart_item_id").in("cart_item_id", ids),
    ]);
    if (modifiers.error) throw modifiers.error;
    if (gas.error) throw gas.error;
    const withExtras = new Set([...(modifiers.data ?? []), ...(gas.data ?? [])].map((row) => row.cart_item_id));

    const lines: Record<string, PublicCartQuickLine> = {};
    for (const item of plain) {
      if (withExtras.has(item.id) || lines[item.product_id]) continue;
      lines[item.product_id] = { itemId: item.id, quantity: Math.max(0, Number(item.quantity ?? 0)) };
    }
    return lines;
  }
}
