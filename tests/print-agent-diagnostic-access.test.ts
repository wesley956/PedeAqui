import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ authorize: vi.fn(), rpc: vi.fn(), from: vi.fn(), authenticate: vi.fn(), complete: vi.fn() }));
vi.mock("@/server/access/authorize", () => ({ authorize: mocks.authorize }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ rpc: mocks.rpc, from: mocks.from }) }));
vi.mock("@/server/printing/agent-api", () => ({ authenticatePrintAgentRequest: mocks.authenticate }));
import { PrintAgentDiagnosticService } from "@/server/printing/print-agent-diagnostic-service";
import { POST } from "@/app/api/print-agent/diagnostics/result/route";

const ids = { agent: "00000000-0000-4000-8000-000000000001", request: "00000000-0000-4000-8000-000000000002", intent: "00000000-0000-4000-8000-000000000003" };
const context = { organizationId: "org-a", storeId: "store-a", userId: "user-a" };
const agent = { id: ids.agent, organization_id: "org-a", store_id: "store-a" };
const report = { schemaVersion: 1, agentVersion: "0.8.0", platform: "win32", startedAt: "2026-10-29T00:00:00.000Z", finishedAt: "2026-10-29T00:00:01.000Z", checks: [{ name: "runtime", status: "ok", code: "checked", values: {} }] };
beforeEach(() => {
  vi.clearAllMocks(); mocks.authorize.mockResolvedValue(context); mocks.authenticate.mockResolvedValue(agent);
  mocks.rpc.mockResolvedValue({ data: ids.request, error: null });
});
describe("diagnostic management authorization", () => {
  it("binds the command to the authenticated actor, organization and store", async () => {
    expect(await PrintAgentDiagnosticService.request(ids.agent, ids.intent)).toBe(ids.request);
    expect(mocks.authorize).toHaveBeenCalledWith("printing.manage");
    expect(mocks.rpc).toHaveBeenCalledWith("print_agent_request_diagnostic_internal", { p_agent_id: ids.agent, p_intent_key: ids.intent, p_organization_id: "org-a", p_store_id: "store-a", p_actor_user_id: "user-a" });
  });
  it("denies unauthorized operators before administrative reads or writes", async () => {
    mocks.authorize.mockRejectedValue(new Error("forbidden"));
    await expect(PrintAgentDiagnosticService.request(ids.agent, ids.intent)).rejects.toThrow("forbidden");
    await expect(PrintAgentDiagnosticService.list()).rejects.toThrow("forbidden");
    await expect(PrintAgentDiagnosticService.cancel(ids.request)).rejects.toThrow("forbidden");
    expect(mocks.rpc).not.toHaveBeenCalled(); expect(mocks.from).not.toHaveBeenCalled();
  });
  it("rejects unscoped access and invalid identifiers", async () => {
    mocks.authorize.mockResolvedValue({ ...context, storeId: null });
    await expect(PrintAgentDiagnosticService.request(ids.agent, ids.intent)).rejects.toThrow("active_store_required");
    await expect(PrintAgentDiagnosticService.request("other", ids.intent)).rejects.toThrow();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("scopes report reads and cancellation to the selected organization/store", async () => {
    const filters: unknown[] = [];
    const builder = { select: () => builder, update: () => builder, eq: (key: string, value: unknown) => { filters.push([key, value]); return builder; }, order: () => builder, limit: () => builder, then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data: [], error: null })) };
    mocks.from.mockReturnValue(builder);
    await PrintAgentDiagnosticService.list(); await PrintAgentDiagnosticService.cancel(ids.request);
    expect(filters.filter(value => JSON.stringify(value) === '["organization_id","org-a"]')).toHaveLength(2);
    expect(filters.filter(value => JSON.stringify(value) === '["store_id","store-a"]')).toHaveLength(2);
    expect(filters).toContainEqual(["status", "pending"]);
  });
});
describe("bounded report endpoint", () => {
  const request = (body: unknown) => new Request("https://example.test/api/print-agent/diagnostics/result", { method: "POST", body: JSON.stringify(body) });
  it("requires an active agent before reading report content", async () => {
    mocks.authenticate.mockResolvedValue(null);
    expect((await POST(request({}))).status).toBe(401); expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("uses the authenticated computer instead of trusting body scope", async () => {
    mocks.rpc.mockResolvedValue({ data: "completed", error: null });
    const response = await POST(request({ requestId: ids.request, agentId: "forged", report: { ...report, token: "private" } }));
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ status: "completed" });
    expect(mocks.rpc.mock.lastCall?.[1].p_agent_id).toBe(ids.agent);
    expect(JSON.stringify(mocks.rpc.mock.lastCall)).not.toMatch(/private|forged/);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("rejects oversize streamed bodies and malformed reports", async () => {
    expect((await POST(request({ padding: "x".repeat(40000) }))).status).toBe(413);
    expect((await POST(request({ requestId: ids.request, report: {} }))).status).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("does not expose database errors or mark an upload complete on failure", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: new Error("private provider credential") });
    const response = await POST(request({ requestId: ids.request, report }));
    expect(response.status).toBe(503); expect(await response.text()).not.toContain("private");
  });
});
