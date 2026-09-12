import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";

function requireStoreId(storeId: string | null) {
  if (!storeId) throw new Error("Selecione uma unidade para acessar Conversas.");
  return storeId;
}

export type HumanAttentionAlertData = {
  count: number;
  firstConversationId: string | null;
};

export class HumanAttentionAlertService {
  static async load(): Promise<HumanAttentionAlertData> {
    const context = await authorize(PERMISSIONS.CONVERSATIONS_VIEW);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();

    const { data, error, count } = await admin.from("conversations")
      .select("id, last_message_at, opened_at", { count: "exact" })
      .eq("organization_id", context.organizationId)
      .eq("store_id", storeId)
      .eq("status", "waiting_agent")
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .order("opened_at", { ascending: false })
      .limit(1);

    if (error) throw error;

    return {
      count: count ?? 0,
      firstConversationId: data?.[0]?.id ?? null,
    };
  }
}
