import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { StoreOperationalStatusService } from "@/server/menu/store-operational-status";
import { isWithinBotPreopenWindow } from "@/server/conversations/bot-preopen-window";

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
    const scope = { organizationId: conversation.organization_id, storeId: conversation.store_id };
    if (await this.canSend({ ...scope, receivedAt })) return true;

    // A temporary event closure must still answer new messages with dates/reason.
    // This is reply-only; notification sends and human-takeover guards remain unchanged.
    const nowForClosure = new Date();
    const statusForClosure = await StoreOperationalStatusService.load({ ...scope, now: nowForClosure });
    if (statusForClosure.reason === "event_closed") {
      if (!receivedAt) return true;
      const inbound = new Date(receivedAt).getTime();
      return Number.isFinite(inbound) && inbound <= nowForClosure.getTime() && nowForClosure.getTime() - inbound <= 5 * 60_000;
    }

    // The optional early bot shift is intentionally reply-only: order status
    // notifications and checkout are still governed by the actual store hours.
    const { data: settings, error: settingsError } = await admin.from("store_conversation_settings")
      .select("bot_only_when_open, bot_preopen_minutes")
      .eq("organization_id", scope.organizationId).eq("store_id", scope.storeId).maybeSingle();
    if (settingsError) throw settingsError;
    const minutes = Number(settings?.bot_preopen_minutes ?? 0);
    if (!settings?.bot_only_when_open || !Number.isInteger(minutes) || minutes <= 0 || minutes > 180) return false;

    const [storeResult, hoursResult] = await Promise.all([
      admin.from("stores").select("status, timezone")
        .eq("organization_id", scope.organizationId).eq("id", scope.storeId).maybeSingle(),
      admin.from("store_hours").select("weekday, opens_at, active")
        .eq("organization_id", scope.organizationId).eq("store_id", scope.storeId).eq("active", true),
    ]);
    if (storeResult.error) throw storeResult.error;
    if (hoursResult.error) throw hoursResult.error;
    if (storeResult.data?.status !== "active" || !storeResult.data.timezone) return false;

    const window = (now: Date) => isWithinBotPreopenWindow({
      now, timezone: storeResult.data!.timezone,
      hours: hoursResult.data ?? [], minutes,
    });
    const now = new Date();
    if (!window(now)) return false;
    if (!receivedAt) return true;
    const inbound = new Date(receivedAt);
    // Do not answer delayed or future-dated webhook messages as if freshly received.
    return inbound.getTime() <= now.getTime()
      && now.getTime() - inbound.getTime() <= 5 * 60 * 1000
      && window(inbound);
  }
}
