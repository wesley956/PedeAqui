import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveStoreOperationalStatus } from "@/server/menu/store-operational-status-core";

const mocks = vi.hoisted(() => ({
  queries: [] as Array<{ table: string; filters: Array<[string, unknown]> }>,
  settings: { bot_only_when_open: true } as { bot_only_when_open: boolean } | null,
  conversation: { organization_id: "org-a", store_id: "store-a" } as { organization_id: string; store_id: string } | null,
  error: null as Error | null,
  acceptingOrders: true,
  storeStatus: "active",
  hours: [{ weekday: 1, opens_at: "18:00:00", closes_at: "23:00:00", closes_next_day: false }],
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from(table: string) {
  const query = { table, filters: [] as Array<[string, unknown]> };
  mocks.queries.push(query);
  const builder = {
    select: () => builder,
    eq: (key: string, value: unknown) => { query.filters.push([key, value]); return builder; },
    maybeSingle: async () => ({ data: table === "conversations" ? mocks.conversation : mocks.settings, error: mocks.error }),
  };
  return builder;
} }) }));
vi.mock("@/server/menu/store-operational-status", () => ({ StoreOperationalStatusService: { load: vi.fn() } }));
import { StoreOperationalStatusService } from "@/server/menu/store-operational-status";
import { WhatsAppAutomationHoursService } from "@/server/conversations/automation-hours-service";

const scope = { organizationId: "org-a", storeId: "store-a" };
const monday = (time: string) => new Date(`2026-10-26T${time}-03:00`);

beforeEach(() => {
  vi.clearAllMocks();
  mocks.queries = [];
  mocks.settings = { bot_only_when_open: true };
  mocks.conversation = { organization_id: "org-a", store_id: "store-a" };
  mocks.error = null;
  mocks.acceptingOrders = true;
  mocks.storeStatus = "active";
  mocks.hours = [{ weekday: 1, opens_at: "18:00:00", closes_at: "23:00:00", closes_next_day: false }];
  vi.mocked(StoreOperationalStatusService.load).mockImplementation(async (input) => resolveStoreOperationalStatus({
    storeStatus: mocks.storeStatus, acceptingOrders: mocks.acceptingOrders,
    hours: mocks.hours, timeZone: "America/Sao_Paulo", now: input.now,
  }));
});

describe("automatic WhatsApp opening hours", () => {
  it.each([["12:00:00", false], ["17:59:59", false], ["18:00:00", true], ["22:59:59", true], ["23:00:00", false]])("at %s allows automatic sends: %s", async (clock, allowed) => {
    expect(await WhatsAppAutomationHoursService.canSend({ ...scope, now: monday(clock) })).toBe(allowed);
  });
  it("stays silent on a day without opening hours or without any schedule", async () => {
    expect(await WhatsAppAutomationHoursService.canSend({ ...scope, now: new Date("2026-10-27T19:00:00-03:00") })).toBe(false);
    mocks.hours = [];
    expect(await WhatsAppAutomationHoursService.canSend({ ...scope, now: monday("19:00:00") })).toBe(false);
  });
  it("honors manual pause and unavailable stores", async () => {
    mocks.acceptingOrders = false;
    expect(await WhatsAppAutomationHoursService.canSend({ ...scope, now: monday("19:00:00") })).toBe(false);
    mocks.acceptingOrders = true;
    mocks.storeStatus = "temporarily_closed";
    expect(await WhatsAppAutomationHoursService.canSend({ ...scope, now: monday("19:00:00") })).toBe(false);
  });
  it("keeps an overnight shift open until closing, in the store timezone", async () => {
    mocks.hours = [{ weekday: 1, opens_at: "18:00:00", closes_at: "02:00:00", closes_next_day: true }];
    expect(await WhatsAppAutomationHoursService.canSend({ ...scope, now: new Date("2026-10-27T04:59:00Z") })).toBe(true);
    expect(await WhatsAppAutomationHoursService.canSend({ ...scope, now: new Date("2026-10-27T05:00:00Z") })).toBe(false);
  });
  it("does not answer a daytime message delivered after reopening", async () => {
    expect(await WhatsAppAutomationHoursService.canSend({ ...scope, now: monday("19:00:00"), receivedAt: monday("12:00:00").toISOString() })).toBe(false);
    expect(await WhatsAppAutomationHoursService.canSend({ ...scope, now: monday("19:00:00"), receivedAt: monday("18:30:00").toISOString() })).toBe(true);
  });
  it("preserves existing behavior when the option is off", async () => {
    mocks.settings = { bot_only_when_open: false };
    expect(await WhatsAppAutomationHoursService.canSend({ ...scope, now: monday("12:00:00") })).toBe(true);
    expect(StoreOperationalStatusService.load).not.toHaveBeenCalled();
  });
  it("uses the conversation's organization and store, and skips duplicate messages", async () => {
    mocks.settings = { bot_only_when_open: false };
    expect(await WhatsAppAutomationHoursService.canReply({ conversation_id: "conversation-a" })).toBe(true);
    expect(mocks.queries[1]?.filters).toEqual([["organization_id", "org-a"], ["store_id", "store-a"]]);
    mocks.queries = [];
    expect(await WhatsAppAutomationHoursService.canReply({ conversation_id: "conversation-a", message_created: false })).toBe(false);
    expect(mocks.queries).toHaveLength(0);
  });
  it("does not allow sends for missing settings or missing conversation", async () => {
    mocks.settings = null;
    expect(await WhatsAppAutomationHoursService.canSend(scope)).toBe(false);
    mocks.conversation = null;
    expect(await WhatsAppAutomationHoursService.canReply({ conversation_id: "missing" })).toBe(false);
  });
  it("propagates lookup errors so callers can remain silent", async () => {
    mocks.error = new Error("database unavailable");
    await expect(WhatsAppAutomationHoursService.canSend(scope)).rejects.toThrow("database unavailable");
  });
});
