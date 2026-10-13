import "server-only";

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";

export type PublicStoreBrand = {
  primaryColor: string;
  minimumOrderCents: number;
};

const HEX = /^#[0-9a-f]{6}$/i;
const DEFAULT_COLOR = "#FF6B00";

/**
 * Cor da loja para todas as telas públicas (cardápio, produto, carrinho, checkout e pedido).
 * Leitura leve e cacheada por requisição; se falhar, as telas seguem com a cor padrão do PedeAqui.
 */
export const getPublicStoreBrand = cache(async (slug: string): Promise<PublicStoreBrand | null> => {
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/i.test(slug)) return null;
  try {
    const admin = createAdminClient();
    const { data: store } = await admin.from("stores")
      .select("id, organization_id")
      .ilike("slug", slug)
      .in("status", ["active", "temporarily_closed"])
      .maybeSingle();
    if (!store) return null;
    const { data: settings } = await admin.from("store_menu_settings")
      .select("primary_color, minimum_order_cents")
      .eq("organization_id", store.organization_id)
      .eq("store_id", store.id)
      .maybeSingle();
    const color = typeof settings?.primary_color === "string" && HEX.test(settings.primary_color) ? settings.primary_color : DEFAULT_COLOR;
    return { primaryColor: color, minimumOrderCents: Number(settings?.minimum_order_cents ?? 0) };
  } catch {
    return null;
  }
});
