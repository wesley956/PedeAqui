import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export async function allowPublicItemNotes(storeId: string): Promise<boolean> {
  const { data, error } = await createAdminClient().from("store_menu_settings")
    .select("allow_item_notes").eq("store_id", storeId).maybeSingle();
  if (error) throw error;
  return data?.allow_item_notes !== false;
}
