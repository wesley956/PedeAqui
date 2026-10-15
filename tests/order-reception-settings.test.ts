import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ current: null as Record<string, unknown> | null, payload: null as Record<string, unknown> | null, audit: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/access/authorize", () => ({ authorize: vi.fn(async () => ({ organizationId: "org", storeId: "store", userId: "actor" })) }));
vi.mock("@/server/audit/audit-service", () => ({ AuditService: { record: mocks.audit } }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: () => {
  const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: mocks.current, error: null }), upsert: async (payload: Record<string, unknown>) => { mocks.payload = payload; return { error: null }; } };
  return chain;
} }) }));
import { OrderWorkflowSettingsService } from "@/server/orders/order-workflow-settings-service";
import { defaultCustomWorkflowConfig } from "@/features/orders/workflow-config";

const options = { source: "user_action", reason: "test" };
beforeEach(() => { mocks.current = null; mocks.payload = null; mocks.audit.mockClear(); });
describe("per-store order reception", () => {
  it("keeps legacy automatic acceptance visible", async () => {
    mocks.current = { orders_auto_accept: true, orders_workflow_mode: "custom", orders_custom_workflow: defaultCustomWorkflowConfig };
    expect((await OrderWorkflowSettingsService.get()).settings.receptionMode).toBe("auto_accept");
  });
  it("uses a server activation time rather than a submitted time", async () => {
    await OrderWorkflowSettingsService.save({ mode: "custom", receptionMode: "auto_prepare", custom: { ...defaultCustomWorkflowConfig, autoPrepareFrom: "2000-01-01T00:00:00.000Z" } }, options);
    const custom = mocks.payload?.orders_custom_workflow as Record<string, unknown>;
    expect(custom.autoPrepareFrom).not.toBe("2000-01-01T00:00:00.000Z");
    expect(Date.parse(String(custom.autoPrepareFrom))).toBeGreaterThan(Date.now() - 5000);
    expect(mocks.payload?.orders_auto_accept).toBe(true);
    expect(mocks.payload?.store_id).toBe("store");
    expect(mocks.audit).toHaveBeenCalledOnce();
  });
  it("preserves activation time when saving an already active configuration", async () => {
    mocks.current = { orders_auto_accept: true, orders_workflow_mode: "custom", orders_custom_workflow: { ...defaultCustomWorkflowConfig, receptionMode: "auto_prepare", autoPrepareFrom: "2026-10-15T09:00:00.000Z" } };
    await OrderWorkflowSettingsService.save({ mode: "custom", receptionMode: "auto_prepare", custom: defaultCustomWorkflowConfig }, options);
    expect((mocks.payload?.orders_custom_workflow as Record<string, unknown>).autoPrepareFrom).toBe("2026-10-15T09:00:00.000Z");
  });
  it("can disable automation and clears its activation time", async () => {
    await OrderWorkflowSettingsService.save({ mode: "custom", receptionMode: "manual", custom: defaultCustomWorkflowConfig }, options);
    expect(mocks.payload?.orders_auto_accept).toBe(false);
    expect((mocks.payload?.orders_custom_workflow as Record<string, unknown>).autoPrepareFrom).toBeNull();
  });
  it("rejects auto preparation with hidden preparation checkpoints", async () => {
    await expect(OrderWorkflowSettingsService.save({ mode: "custom", receptionMode: "auto_prepare", custom: { ...defaultCustomWorkflowConfig, pickup: ["new", "finished"] } }, options)).rejects.toThrow("Em preparo");
    expect(mocks.payload).toBeNull();
  });
  it("keeps simplified mode incompatible with manual acceptance", async () => {
    await expect(OrderWorkflowSettingsService.save({ mode: "simplified", receptionMode: "manual", custom: defaultCustomWorkflowConfig }, options)).rejects.toThrow("simplificado");
  });
});
