import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAccessContext } from "@/server/access/context";

/** Fuso da unidade atual (padrão America/Sao_Paulo), usado para "volta amanhã às 00:00". */
export async function currentStoreTimezone(): Promise<string> {
  const context = await getAccessContext();
  if (!context.storeId) return "America/Sao_Paulo";
  const { data } = await createAdminClient().from("stores").select("timezone")
    .eq("id", context.storeId).eq("organization_id", context.organizationId).maybeSingle();
  return (data?.timezone as string | null) || "America/Sao_Paulo";
}
