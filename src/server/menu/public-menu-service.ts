import "server-only";

import { createPublicClient } from "@/lib/supabase/public";
import { isOpenAt } from "@/server/menu/schedule";
import { publicMenuSchema, publicProductSchema, type PublicMenu, type PublicProduct } from "@/server/menu/schemas";

export type PublicMenuState = PublicMenu & {
  operational: {
    scheduleOpen: boolean;
    acceptingOrders: boolean;
    canOrder: boolean;
    label: "open" | "closed" | "paused";
  };
};

export class PublicMenuService {
  static async getMenu(slug: string, now = new Date()): Promise<PublicMenuState | null> {
    const supabase = createPublicClient();
    const { data, error } = await supabase.rpc("get_public_menu", { p_store_slug: slug });
    if (error) throw error;
    if (!data) return null;

    const menu = publicMenuSchema.parse(data);
    const scheduleOpen = menu.store.status === "active" && isOpenAt(menu.hours, menu.store.timezone, now);
    const acceptingOrders = menu.settings.accepting_orders;
    const canOrder = scheduleOpen && acceptingOrders;
    const label = !acceptingOrders ? "paused" : scheduleOpen ? "open" : "closed";

    return { ...menu, operational: { scheduleOpen, acceptingOrders, canOrder, label } };
  }

  static async getProduct(slug: string, productId: string): Promise<PublicProduct | null> {
    const supabase = createPublicClient();
    const { data, error } = await supabase.rpc("get_public_product", {
      p_store_slug: slug,
      p_product_id: productId,
    });
    if (error) throw error;
    if (!data) return null;
    return publicProductSchema.parse(data);
  }
}
