import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { StoreOperationalStatusService } from "@/server/menu/store-operational-status";

type StoreScope = { organizationId: string; storeId: string };

/** Only automatic sends use this policy; human replies remain available. */
export class WhatsAppAutomationHoursService {
  static async canSend(input: StoreScope & { receivedAt?: string | null; now?: Date }): Promise<boolean> {
    const admin = createAdminClient();
    const { data: settings, error } = await admin.from("store_conversation_settings")
      .select("bot_only_when_open")
      .eq("organization_id", input.organizationId)
      .eq("store_id", input.storeId)
      .maybeSingle();
    if (error) throw error;
    if (!settings) return false;
    if (!settings.bot_only_when_open) return true;

    const now = input.now ?? new Date();
    const current = await StoreOperationalStatusService.load({ ...input, now });
    if (!current.canOrder) return false;

    // A webhook delivered late must never answer a daytime message on reopening.
    if (input.receivedAt) {
      const receivedAt = new Date(input.receivedAt);
      if (!Number.isFinite(receivedAt.getTime())) return false;
      const original = await StoreOperationalStatusService.load({ ...input, now: receivedAt });
      if (!original.canOrder) return false;
    }
    return true;
  }

  static async canReply(result: { conversation_id?: string | null; message_created?: boolean | null } | null, receivedAt?: string | null) {
    if (!result?.conversation_id || result.message_created === false) return false;
    const admin = createAdminClient();
    const { data: conversation, error } = await admin.from("conversations")
      .select("organization_id, store_id")
      .eq("id", result.conversation_id)
      .maybeSingle();
    if (error) throw error;
    if (!conversation) return false;
    return this.canSend({ organizationId: conversation.organization_id, storeId: conversation.store_id, receivedAt });
  }
}
