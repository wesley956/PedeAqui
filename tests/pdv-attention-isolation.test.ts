import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ authorize: vi.fn(), calls: [] as unknown[][], error: null as unknown }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/access/authorize", () => ({ authorize: state.authorize }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from(table: string) {
  state.calls.push(["from", table]);
  const query = new Proxy({}, { get: (_, key) => (...args: unknown[]) => {
    state.calls.push([key, ...args]);
    return key === "limit" ? Promise.resolve({ data: [{ id: "conversation" }], count: 3, error: state.error }) : query;
  } });
  return query;
} }) }));
import { HumanAttentionAlertService } from "@/server/conversations/human-attention-alert-service";
import { GET } from "@/app/api/conversations/human-attention/route";

beforeEach(() => { state.calls = []; state.error = null; state.authorize.mockReset().mockResolvedValue({ storeId: "store-a", organizationId: "org-a" }); });
describe("human-attention snapshot without a PDV page refresh", () => {
  it("counts only the authenticated organization/store and returns the same queue", async () => {
    expect(await HumanAttentionAlertService.load()).toEqual({ count: 3, firstConversationId: "conversation" });
    expect(state.calls).toContainEqual(["eq", "organization_id", "org-a"]);
    expect(state.calls).toContainEqual(["eq", "store_id", "store-a"]);
    expect(state.calls).toContainEqual(["eq", "status", "waiting_agent"]);
    expect(state.authorize).toHaveBeenCalledWith("conversations.view");
  });
  it("rejects a stale/foreign store before touching data", async () => {
    const response = await GET(new Request("https://test.invalid/api/conversations/human-attention?storeId=store-b"));
    expect(response.status).toBe(403);
    expect(state.calls).toEqual([]);
  });
  it("fails closed for missing permission and does not leak internal errors", async () => {
    state.authorize.mockRejectedValue(new Error("secret authorization details"));
    const response = await GET(new Request("https://test.invalid/api/conversations/human-attention"));
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain("secret");
  });
  it("never caches a queue snapshot shared with other operators", async () => {
    const response = await GET(new Request("https://test.invalid/api/conversations/human-attention?storeId=store-a"));
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ storeId: "store-a", alert: { count: 3, firstConversationId: "conversation" } });
  });
});
