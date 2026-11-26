import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
export type EventClosure = { reason: string; startsAt: string; endsAt: string };
export async function loadEventClosure(organizationId: string | null, storeId: string, now = new Date()): Promise<EventClosure | null> {
  let query = createAdminClient().from("pdv_events").select("closure_reason,closure_starts_at,closure_ends_at")
    .eq("store_id", storeId).eq("status", "active").eq("close_store", true)
    .lte("closure_starts_at", now.toISOString()).gt("closure_ends_at", now.toISOString()).order("closure_ends_at", { ascending: false }).limit(1);
  if (organizationId) query = query.eq("organization_id", organizationId);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data ? { reason: data.closure_reason, startsAt: data.closure_starts_at, endsAt: data.closure_ends_at } : null;
}

/** The public menu RPC already resolved this globally unique store UUID. No client-supplied tenant is used. */
export async function loadEventClosureForPublicStore(storeId: string, now = new Date()) {
  return loadEventClosure(null, storeId, now);
}
