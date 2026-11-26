import "server-only";
import { z } from "zod";
import { validateEventWindow } from "@/features/pdv/event-model";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { zonedLocalDateTimeToUtc } from "@/server/checkout/scheduling";
import { eventCreateSchema, eventItemsSchema, type EventCreateInput, type PdvEvent, type PdvEventStatus } from "./schemas";

const keySchema = z.string().trim().min(8).max(200);
async function scope(manage = false) {
  const context = await authorize(PERMISSIONS.ORDERS_CREATE);
  if (manage) await authorize(PERMISSIONS.STORES_MANAGE, context);
  if (!context.storeId) throw new Error("Selecione uma unidade.");
  return { ...context, storeId: context.storeId };
}
export class PdvEventService {
  static async load() {
    const context = await scope();
    const admin = createAdminClient();
    const { data, error } = await admin.from("pdv_events")
      .select("id,name,starts_at,ends_at,status,close_store,closure_reason,closure_starts_at,closure_ends_at,pdv_event_items(product_id,allocated,sold)")
      .eq("organization_id", context.organizationId).eq("store_id", context.storeId).order("created_at", { ascending: false }).limit(100);
    if (error) throw error;
    let canManage = false;
    try { await authorize(PERMISSIONS.STORES_MANAGE, context); canManage = true; } catch { /* Sale permission does not grant store management. */ }
    const events: PdvEvent[] = (data ?? []).map(row => ({
      id: row.id, name: row.name, startsAt: row.starts_at, endsAt: row.ends_at, status: row.status as PdvEventStatus,
      closeStore: row.close_store, closureReason: row.closure_reason, closureStartsAt: row.closure_starts_at, closureEndsAt: row.closure_ends_at,
      items: (row.pdv_event_items ?? []).map((i: {product_id: string; allocated: number; sold: number}) => ({ productId: i.product_id, allocated: Number(i.allocated), sold: Number(i.sold) })),
    }));
    return { events, canManage, timeZone: context.timezone || "America/Sao_Paulo" };
  }
  private static async manage(id: string, action: string, data: Record<string, unknown>, key: string) {
    const context = await scope(true);
    const admin = createAdminClient();
    const result = await admin.rpc("pdv_event_manage_internal", { p_organization_id: context.organizationId, p_store_id: context.storeId, p_event_id: z.string().uuid().parse(id), p_action: action, p_data: data, p_idempotency_key: keySchema.parse(key), p_actor_user_id: context.userId });
    if (result.error) throw result.error;
    return id;
  }
  static async create(input: EventCreateInput, key: string) {
    const value = eventCreateSchema.parse(input);
    const context = await scope(true);
    const toUtc = (local: string) => zonedLocalDateTimeToUtc(local, context.timezone || "America/Sao_Paulo").toISOString();
    const startsAt = toUtc(value.startsLocal), endsAt = toUtc(value.endsLocal);
    validateEventWindow({ startsAt, endsAt, storeOpen: !value.closeStore, closureReason: value.closureReason });
    const from = value.closeStore ? toUtc(value.closureStartsLocal!) : null;
    const until = value.closeStore ? toUtc(value.closureEndsLocal!) : null;
    if (from && until && (from < startsAt || until > endsAt || until <= from)) throw new Error("O fechamento deve estar dentro do período do evento.");
    return this.manage(value.id, "create", { name: value.name, starts_at: startsAt, ends_at: endsAt, close_store: value.closeStore, closure_reason: value.closeStore ? value.closureReason : null, closure_starts_at: from, closure_ends_at: until, items: value.items.map(i => ({ product_id: i.productId, quantity: i.quantity })) }, key);
  }
  static async transition(id: string, action: "activate" | "close" | "cancel", key: string) {
    z.enum(["activate", "close", "cancel"]).parse(action);
    return this.manage(id, action, {}, key);
  }
  static async restock(id: string, items: z.infer<typeof eventItemsSchema>, key: string) {
    return this.manage(id, "restock", { items: eventItemsSchema.parse(items).map(i => ({ product_id: i.productId, quantity: i.quantity })) }, key);
  }
  static async report(id: string) {
    const context = await scope();
    await authorize(PERMISSIONS.FINANCE_REPORTS, context);
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("pdv_event_report_internal", { p_organization_id: context.organizationId, p_store_id: context.storeId, p_event_id: z.string().uuid().parse(id) });
    if (error) throw error;
    return z.object({ sales: z.number().int().nonnegative(), totalCents: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), discountCents: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) }).parse(data);
  }
}
