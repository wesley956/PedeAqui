import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { loadDiningCatalog } from "@/server/dining/catalog";
import { diningRoundInputSchema, type DiningRoundInput } from "@/server/dining/schemas";

const publicCodeSchema = z.string().regex(/^[0-9a-f]{30}$/);
const idemSchema = z.string().trim().min(8).max(180);
const publicTableSchema = z.object({
  store: z.object({ slug: z.string(), name: z.string(), logo_url: z.string().nullable() }),
  table: z.object({ code: z.string(), name: z.string(), capacity: z.coerce.number() }),
  tab: z.object({ display_number: z.coerce.number(), guest_count: z.coerce.number() }).nullable(),
});

export class PublicDiningService {
  static async load(publicCode: string) {
    const code = publicCodeSchema.parse(publicCode);
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("get_public_table", { p_public_code: code });
    if (error) throw error;
    if (!data) return null;
    const publicState = publicTableSchema.parse(data);

    const admin = createAdminClient();
    const { data: table, error: tableError } = await admin.from("tables")
      .select("id, organization_id, store_id, qr_enabled, status")
      .eq("public_code", code).eq("qr_enabled", true).eq("status", "occupied").maybeSingle();
    if (tableError) throw tableError;
    if (!table) return null;
    const { data: tab, error: tabError } = await admin.from("tabs").select("id")
      .eq("organization_id", table.organization_id).eq("store_id", table.store_id).eq("table_id", table.id)
      .eq("status", "open").order("opened_at", { ascending: false }).limit(1).maybeSingle();
    if (tabError) throw tabError;
    if (!tab) return { ...publicState, canOrder: false as const, categories: [], products: [] };
    const catalog = await loadDiningCatalog(table.organization_id, table.store_id);
    return { ...publicState, canOrder: true as const, ...catalog };
  }

  static async createRound(publicCode: string, input: DiningRoundInput, idempotencyKey: string) {
    const code = publicCodeSchema.parse(publicCode);
    const values = diningRoundInputSchema.parse(input);
    const admin = createAdminClient();
    const { data: table, error: tableError } = await admin.from("tables")
      .select("id, organization_id, store_id, qr_enabled, status")
      .eq("public_code", code).eq("qr_enabled", true).eq("status", "occupied").maybeSingle();
    if (tableError) throw tableError;
    if (!table) throw new Error("Mesa QR indisponível");
    const { data: store, error: storeError } = await admin.from("stores").select("status")
      .eq("id", table.store_id).eq("organization_id", table.organization_id).maybeSingle();
    if (storeError) throw storeError;
    if (!store || store.status !== "active") throw new Error("Unidade indisponível");
    const { data: tab, error: tabError } = await admin.from("tabs").select("id")
      .eq("organization_id", table.organization_id).eq("store_id", table.store_id).eq("table_id", table.id)
      .eq("status", "open").order("opened_at", { ascending: false }).limit(1).maybeSingle();
    if (tabError) throw tabError;
    if (!tab) throw new Error("Comanda QR indisponível");

    const { data, error } = await admin.rpc("dining_create_round_internal", {
      p_tab_id: tab.id,
      p_items: values.items.map((item) => ({ product_id: item.productId, quantity: item.quantity, note: item.note, modifier_ids: item.modifierIds })),
      p_idempotency_key: idemSchema.parse(idempotencyKey), p_actor_user_id: null, p_channel: "table_qr",
    });
    if (error) throw error;
    return z.object({ order_id: z.string().uuid(), display_number: z.coerce.number(), round_number: z.coerce.number(), total_cents: z.coerce.number(), created: z.boolean() }).parse(data);
  }
}
