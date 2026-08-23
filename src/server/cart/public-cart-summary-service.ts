import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { hashCartToken } from "@/server/cart/cart-token";

export type PublicCartSummary = {
  itemCount: number;
  subtotalCents: number;
  totalCents: number;
  updatedAt: string;
};

export class PublicCartSummaryService {
  static async get(storeSlug: string, token?: string | null): Promise<PublicCartSummary | null> {
    if (!token) return null;

    const admin = createAdminClient();
    const { data: store, error: storeError } = await admin
      .from("stores")
      .select("id, organization_id")
      .ilike("slug", storeSlug)
      .in("status", ["active", "temporarily_closed"])
      .maybeSingle();

    if (storeError) throw storeError;
    if (!store) return null;

    const { data: cart, error: cartError } = await admin
      .from("carts")
      .select("id, subtotal_cents, total_cents, updated_at")
      .eq("organization_id", store.organization_id)
      .eq("store_id", store.id)
      .eq("token_hash", hashCartToken(token))
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();

    if (cartError) throw cartError;
    if (!cart) return null;

    const { data: items, error: itemsError } = await admin
      .from("cart_items")
      .select("quantity")
      .eq("organization_id", store.organization_id)
      .eq("store_id", store.id)
      .eq("cart_id", cart.id);

    if (itemsError) throw itemsError;

    const itemCount = (items ?? []).reduce((total, item) => total + Math.max(0, Number(item.quantity ?? 0)), 0);
    if (itemCount === 0) return null;

    return {
      itemCount,
      subtotalCents: Number(cart.subtotal_cents ?? 0),
      totalCents: Number(cart.total_cents ?? 0),
      updatedAt: cart.updated_at,
    };
  }
}
