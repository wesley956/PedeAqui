import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const state = vi.hoisted(() => ({ panel: false, sound: true, reads: 0, eventReads: 0, error: null as Error | null }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (table: string) => {
  let sound = false;
  const builder = {
    select: () => builder,
    eq: (field: string) => { if (field === "sound_enabled") sound = true; return builder; },
    gte: () => builder, gt: () => builder, order: () => builder, limit: () => builder,
    maybeSingle: async () => { state.reads++; return { data: (sound ? state.sound : state.panel) ? { browser_id: "browser" } : null, error: state.error }; },
    upsert: async (value: { is_active: boolean; sound_enabled: boolean }) => { state.panel = value.is_active; state.sound = value.sound_enabled; return { error: null }; },
    then: (resolve: (value: unknown) => unknown) => { state.eventReads++; return Promise.resolve({ data: [{ id: String(state.eventReads), order_id: "order", display_number: 190, occurred_at: "2026-10-20T17:00:00Z" }], error: null }).then(resolve); },
  };
  if (table !== "order_alert_events" && table !== "order_alert_panel_presence") throw new Error(table);
  return builder;
} }) }));
import { OrderAlertBackupService } from "@/server/orders/order-alert-backup-service";
import type { AccessContext } from "@/server/access/context";
let agent: { organization_id: string; store_id: string };
let number = 0;
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(0); state.panel = false; state.sound = true; state.reads = 0; state.eventReads = 0; state.error = null; agent = { organization_id: "org", store_id: `store-${++number}` }; });
afterEach(() => vi.useRealTimers());
it("reuses presence reads but continues fetching new order events on every poll", async () => {
  expect((await OrderAlertBackupService.pollForAgent(agent, "0")).orders[0]?.id).toBe("1");
  expect((await OrderAlertBackupService.pollForAgent(agent, "1")).orders[0]?.id).toBe("2");
  expect(state.reads).toBe(2);
  expect(state.eventReads).toBe(2);
});
it("reflects panel open, close and sound changes immediately after presence updates", async () => {
  expect(await OrderAlertBackupService.statusForAgent(agent)).toEqual({ panelActive: false, nativeEnabled: true });
  const context = { organizationId: agent.organization_id, storeId: agent.store_id, userId: "user" } as AccessContext;
  const browser = "11111111-1111-4111-8111-111111111111";
  await OrderAlertBackupService.setPanelPresence(context, browser, true, true);
  expect(await OrderAlertBackupService.statusForAgent(agent)).toEqual({ panelActive: true, nativeEnabled: true });
  await OrderAlertBackupService.setPanelPresence(context, browser, false, false);
  expect(await OrderAlertBackupService.statusForAgent(agent)).toEqual({ panelActive: false, nativeEnabled: false });
});
it("reloads silent presence changes after the ten-second TTL", async () => {
  await OrderAlertBackupService.statusForAgent(agent);
  state.panel = true;
  vi.setSystemTime(10_000);
  expect((await OrderAlertBackupService.statusForAgent(agent)).panelActive).toBe(true);
  expect(state.reads).toBe(4);
});
it("does not cache a database failure", async () => {
  state.error = new Error("database unavailable");
  await expect(OrderAlertBackupService.statusForAgent(agent)).rejects.toThrow("database unavailable");
  state.error = null;
  expect(await OrderAlertBackupService.statusForAgent(agent)).toEqual({ panelActive: false, nativeEnabled: true });
});
