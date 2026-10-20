import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  active: true,
  validHash: "",
  reads: 0,
  rpc: vi.fn(),
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({
  from: () => {
    let hash = "";
    const builder = {
      select: () => builder,
      eq: (field: string, value: string) => { if (field === "token_hash") hash = value; return builder; },
      maybeSingle: async () => {
        mocks.reads++;
        return { data: mocks.active && hash === mocks.validHash
          ? { id: "agent", organization_id: "org", store_id: "store", name: "Caixa" }
          : null, error: null };
      },
    };
    return builder;
  },
  rpc: mocks.rpc,
}) }));
vi.mock("@/server/access/authorize", () => ({ authorize: vi.fn() }));
vi.mock("@/server/audit/audit-service", () => ({ AuditService: { record: vi.fn() } }));

import { hashPrintAgentToken } from "@/server/printing/agent-token";
import { PrintQueueService, invalidatePrintAgentAuthCache } from "@/server/printing/print-queue-service";

const oldToken = "old-agent-token-long-enough";
const newToken = "new-agent-token-long-enough";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  invalidatePrintAgentAuthCache();
  mocks.active = true;
  mocks.validHash = hashPrintAgentToken(oldToken);
  mocks.reads = 0;
  mocks.rpc.mockReset();
});
afterEach(() => vi.useRealTimers());

describe("Print Agent authentication cache behavior", () => {
  it("shares authentication reads across polling and reloads after 30 seconds", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, () => PrintQueueService.authenticateAgent(oldToken)));
    expect(results.every((agent) => agent?.id === "agent")).toBe(true);
    expect(mocks.reads).toBe(1);
    vi.setSystemTime(29_999);
    expect(await PrintQueueService.authenticateAgent(oldToken)).not.toBeNull();
    expect(mocks.reads).toBe(1);
    vi.setSystemTime(30_000);
    await PrintQueueService.authenticateAgent(oldToken);
    expect(mocks.reads).toBe(2);
  });

  it("rejects the old credential after rotation invalidates the cache", async () => {
    await PrintQueueService.authenticateAgent(oldToken);
    mocks.validHash = hashPrintAgentToken(newToken);
    invalidatePrintAgentAuthCache();
    expect(await PrintQueueService.authenticateAgent(oldToken)).toBeNull();
    expect(await PrintQueueService.authenticateAgent(newToken)).toMatchObject({ id: "agent" });
    expect(await PrintQueueService.authenticateAgent(oldToken)).toBeNull();
    expect(mocks.reads).toBe(4);
  });

  it("rejects a database-deactivated agent when the cached authentication expires", async () => {
    await PrintQueueService.authenticateAgent(oldToken);
    mocks.active = false;
    vi.setSystemTime(30_000);
    expect(await PrintQueueService.authenticateAgent(oldToken)).toBeNull();
  });

  it("still checks the database claim on every poll and propagates a disabled-agent rejection", async () => {
    const agent = (await PrintQueueService.authenticateAgent(oldToken))!;
    mocks.rpc.mockResolvedValueOnce({ data: [], error: null });
    expect(await PrintQueueService.claim(agent)).toEqual([]);
    mocks.rpc.mockResolvedValueOnce({ data: null, error: new Error("agent unavailable") });
    await expect(PrintQueueService.claim(agent)).rejects.toThrow("agent unavailable");
    expect(mocks.rpc).toHaveBeenCalledTimes(2);
    expect(mocks.rpc).toHaveBeenLastCalledWith("print_agent_claim_internal", { p_agent_id: "agent", p_limit: 5 });
  });
});
