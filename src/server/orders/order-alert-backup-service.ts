import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AccessContext } from "@/server/access/context";

const browserIdSchema = z.string().uuid();
const cursorSchema = z.string().regex(/^\d+$/);
const panelPresenceTtlMs = 90_000;

export type NativeOrderAlertAgentContext = {
  organization_id: string;
  store_id: string;
};

type NativeOrderAlertRow = {
  id: string;
  displayNumber: number | null;
  occurredAt: string;
};

export class OrderAlertBackupService {
  static async setPanelPresence(
    context: AccessContext,
    browserId: string,
    active: boolean,
    soundEnabled: boolean,
  ) {
    if (!context.storeId) throw new Error("An active store is required");
    const safeBrowserId = browserIdSchema.parse(browserId);
    const admin = createAdminClient();
    const now = new Date().toISOString();

    const { error } = await admin
      .from("order_alert_panel_presence")
      .upsert({
        organization_id: context.organizationId,
        store_id: context.storeId,
        user_id: context.userId,
        browser_id: safeBrowserId,
        is_active: active,
        sound_enabled: soundEnabled,
        last_seen_at: now,
      }, { onConflict: "store_id,browser_id" });
    if (error) throw error;
  }

  static async statusForAgent(agent: NativeOrderAlertAgentContext) {
    const admin = createAdminClient();
    const cutoff = new Date(Date.now() - panelPresenceTtlMs).toISOString();

    const [{ data: activePanel, error: activeError }, { data: enabledPreference, error: enabledError }] = await Promise.all([
      admin
        .from("order_alert_panel_presence")
        .select("browser_id")
        .eq("organization_id", agent.organization_id)
        .eq("store_id", agent.store_id)
        .eq("is_active", true)
        .gte("last_seen_at", cutoff)
        .limit(1)
        .maybeSingle(),
      admin
        .from("order_alert_panel_presence")
        .select("browser_id")
        .eq("organization_id", agent.organization_id)
        .eq("store_id", agent.store_id)
        .eq("sound_enabled", true)
        .limit(1)
        .maybeSingle(),
    ]);
    if (activeError) throw activeError;
    if (enabledError) throw enabledError;

    return { panelActive: Boolean(activePanel), nativeEnabled: Boolean(enabledPreference) };
  }

  static async baselineCursor(agent: NativeOrderAlertAgentContext) {
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("order_alert_events")
      .select("id")
      .eq("organization_id", agent.organization_id)
      .eq("store_id", agent.store_id)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data?.id == null ? "0" : String(data.id);
  }

  static async pollForAgent(agent: NativeOrderAlertAgentContext, cursor: string | null) {
    const { panelActive, nativeEnabled } = await this.statusForAgent(agent);

    if (!cursor) {
      return {
        cursor: await this.baselineCursor(agent),
        panelActive,
        nativeEnabled,
        orders: [] as NativeOrderAlertRow[],
      };
    }

    const safeCursor = cursorSchema.parse(cursor);
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("order_alert_events")
      .select("id, display_number, occurred_at")
      .eq("organization_id", agent.organization_id)
      .eq("store_id", agent.store_id)
      .gt("id", safeCursor)
      .order("id", { ascending: true })
      .limit(100);
    if (error) throw error;

    const orders: NativeOrderAlertRow[] = (data ?? []).map((event) => ({
      id: String(event.id),
      displayNumber: event.display_number == null ? null : Number(event.display_number),
      occurredAt: String(event.occurred_at),
    }));
    const nextCursor = orders.at(-1)?.id ?? safeCursor;

    return { cursor: nextCursor, panelActive, nativeEnabled, orders };
  }
}
