import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AccessContext } from "@/server/access/context";

const browserIdSchema = z.string().uuid();
const cursorSchema = z.string().datetime({ offset: true });
const panelPresenceTtlMs = 90_000;
const maxCursorAgeMs = 24 * 60 * 60 * 1000;

export type NativeOrderAlertAgentContext = {
  organization_id: string;
  store_id: string;
};

export class OrderAlertBackupService {
  static async setPanelPresence(context: AccessContext, browserId: string, active: boolean) {
    if (!context.storeId) throw new Error("An active store is required");
    const safeBrowserId = browserIdSchema.parse(browserId);
    const admin = createAdminClient();

    if (!active) {
      const { error } = await admin
        .from("order_alert_panel_presence")
        .delete()
        .eq("organization_id", context.organizationId)
        .eq("store_id", context.storeId)
        .eq("browser_id", safeBrowserId)
        .eq("user_id", context.userId);
      if (error) throw error;
      return;
    }

    const { error } = await admin
      .from("order_alert_panel_presence")
      .upsert({
        organization_id: context.organizationId,
        store_id: context.storeId,
        user_id: context.userId,
        browser_id: safeBrowserId,
        last_seen_at: new Date().toISOString(),
      }, { onConflict: "store_id,browser_id" });
    if (error) throw error;
  }

  static async hasActivePanel(agent: NativeOrderAlertAgentContext) {
    const admin = createAdminClient();
    const cutoff = new Date(Date.now() - panelPresenceTtlMs).toISOString();
    const { data, error } = await admin
      .from("order_alert_panel_presence")
      .select("browser_id")
      .eq("organization_id", agent.organization_id)
      .eq("store_id", agent.store_id)
      .gte("last_seen_at", cutoff)
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return Boolean(data);
  }

  static async pollForAgent(agent: NativeOrderAlertAgentContext, cursor: string | null) {
    const now = new Date();
    const nextCursor = now.toISOString();
    const panelActive = await this.hasActivePanel(agent);

    if (!cursor) {
      return { cursor: nextCursor, panelActive, orders: [] as Array<{ id: string; displayNumber: number | null; createdAt: string }> };
    }

    let since = new Date(cursorSchema.parse(cursor));
    const oldestAllowed = new Date(now.getTime() - maxCursorAgeMs);
    if (since < oldestAllowed) since = oldestAllowed;
    if (since > now) since = now;

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("orders")
      .select("id, display_number, created_at")
      .eq("organization_id", agent.organization_id)
      .eq("store_id", agent.store_id)
      .eq("order_status", "pending_confirmation")
      .gt("created_at", since.toISOString())
      .lte("created_at", nextCursor)
      .order("created_at", { ascending: true })
      .limit(100);
    if (error) throw error;

    return {
      cursor: nextCursor,
      panelActive,
      orders: (data ?? []).map((order) => ({
        id: String(order.id),
        displayNumber: order.display_number == null ? null : Number(order.display_number),
        createdAt: String(order.created_at),
      })),
    };
  }
}
