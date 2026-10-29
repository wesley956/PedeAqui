import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authorize: vi.fn(), from: vi.fn(), failTable: "", calls: [] as Array<{ table: string; filters: Array<[string, unknown]> }> }));
vi.mock("@/server/access/authorize", () => {
  class AuthorizationError extends Error {}
  return { authorize: mocks.authorize, AuthorizationError };
});
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: mocks.from }) }));
import { AuthorizationError } from "@/server/access/authorize";
import { GET } from "@/app/api/printing/health/route";
import { PrintingSafetyService } from "@/server/printing/printing-safety-service";

const context = { organizationId: "org-a", storeId: "store-a", userId: "operator", roleId: null };
describe("authorized printing health read (#1291)", () => {
  beforeEach(() => {
    vi.clearAllMocks(); mocks.calls = []; mocks.failTable = "";
    mocks.authorize.mockResolvedValue(context);
    mocks.from.mockImplementation((table: string) => {
      const call = { table, filters: [] as Array<[string, unknown]> }; mocks.calls.push(call);
      const builder = {
        select: () => builder,
        eq: (key: string, value: unknown) => { call.filters.push([key, value]); return builder; },
        in: () => builder, order: () => builder, limit: () => builder,
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data: [], error: table === mocks.failTable ? new Error("private provider failure") : null })),
      };
      return builder;
    });
  });
  it("scopes every read to the authenticated organization and selected store", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({ storeId: "store-a", issues: [] });
    expect(mocks.calls).toHaveLength(4);
    for (const call of mocks.calls) expect(call.filters).toEqual(expect.arrayContaining([["organization_id", "org-a"], ["store_id", "store-a"]]));
  });
  it("denies permission before opening any administrative database read", async () => {
    mocks.authorize.mockRejectedValue(new AuthorizationError("printing.view"));
    expect((await GET()).status).toBe(403);
    expect(mocks.from).not.toHaveBeenCalled();
  });
  it("does not claim healthy on a failed query or expose its raw error", async () => {
    mocks.failTable = "print_agents";
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private provider failure");
  });
  it("rejects a missing store without querying unrelated units", async () => {
    await expect(PrintingSafetyService.load({ ...context, storeId: null })).rejects.toThrow("active_store_required");
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
