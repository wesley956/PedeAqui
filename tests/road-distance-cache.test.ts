import { describe, expect, it, vi } from "vitest";
import type { createAdminClient } from "@/lib/supabase/admin";
import { quoteCachedRoadDistance } from "@/server/delivery/road-distance-cache";

const { provider } = vi.hoisted(() => ({ provider: vi.fn() }));
vi.mock("@/server/delivery/geoapify-distance-provider", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/server/delivery/geoapify-distance-provider")>(),
  queryGeoapifyRoadMeters: provider,
}));

const input = {
  origin: { latitude: -22.788276, longitude: -47.298420 },
  destination: { street: "Rua dos Cedros", number: "25", district: "Centro", city: "Nova Odessa", state: "SP" },
};

function database(distance: number | null, reserved = true) {
  const table = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gt: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: distance === null ? null : { distance_meters: distance } }),
    upsert: vi.fn().mockResolvedValue({ error: null }),
  };
  const rpc = vi.fn().mockResolvedValue({ data: reserved });
  const admin = { from: vi.fn().mockReturnValue(table), rpc } as unknown as ReturnType<typeof createAdminClient>;
  return { table, rpc, options: { admin, storeId: "jack", apiKey: "test-key" } };
}

describe("persistent delivery route cache", () => {
  it("uses a cached distance without reserving another API call", async () => {
    provider.mockClear();
    const { rpc, options } = database(2416);
    await expect(quoteCachedRoadDistance(input, options)).resolves.toBe(2416);
    expect(rpc).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
  });

  it("blocks external calls after exhausting the shared quota", async () => {
    provider.mockClear();
    const { options } = database(null, false);
    await expect(quoteCachedRoadDistance(input, options)).rejects.toThrow("route_quota_unavailable");
    expect(provider).not.toHaveBeenCalled();
  });

  it("stores the returned distance under a shop-specific hash", async () => {
    provider.mockResolvedValueOnce(2416);
    const { table, rpc, options } = database(null);
    await expect(quoteCachedRoadDistance(input, options)).resolves.toBe(2416);
    expect(rpc).toHaveBeenCalledWith("reserve_delivery_route_quote");
    expect(table.upsert).toHaveBeenCalledWith({
      store_id: "jack",
      cache_key: expect.stringMatching(/^[a-f0-9]{64}$/),
      distance_meters: 2416,
      expires_at: expect.any(String),
    }, { onConflict: "store_id,cache_key" });
  });
});
