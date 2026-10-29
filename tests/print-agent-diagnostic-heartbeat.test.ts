import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }));
import { PrintQueueService } from "@/server/printing/print-queue-service";
const agent = { id: "agent-a", organization_id: "org-a", store_id: "store-a", name: "fixture" };
beforeEach(() => { vi.clearAllMocks(); });
describe("diagnostic command piggyback on existing heartbeat", () => {
  it("returns an explicit command with a single database call for capable agents", async () => {
    const result = { ok: true, diagnostic: { id: "request-a", expiresAt: "2026-11-05T00:00:00Z" } };
    mocks.rpc.mockResolvedValue({ data: result, error: null });
    expect(await PrintQueueService.heartbeat(agent, { version: "0.8.0", capabilities: { onDemandDiagnostics: true } })).toEqual(result);
    expect(mocks.rpc).toHaveBeenCalledTimes(1); expect(mocks.rpc.mock.lastCall?.[0]).toBe("print_agent_heartbeat_diagnostic_internal");
  });
  it("keeps old agents on the original heartbeat without querying diagnostics", async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });
    expect(await PrintQueueService.heartbeat(agent, { version: "0.7.3" })).toEqual({ ok: true, diagnostic: null });
    expect(mocks.rpc).toHaveBeenCalledTimes(1); expect(mocks.rpc.mock.lastCall?.[0]).toBe("print_agent_heartbeat_internal");
  });
  it("preserves liveness and disables diagnostics if the schema is not deployed yet", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: new Error("RPC not deployed") }).mockResolvedValueOnce({ data: true, error: null });
    expect(await PrintQueueService.heartbeat(agent, { capabilities: { onDemandDiagnostics: true } })).toEqual({ ok: true, diagnostic: null });
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual(["print_agent_heartbeat_diagnostic_internal", "print_agent_heartbeat_internal"]);
  });
});
