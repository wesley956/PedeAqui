import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { createAdminClient } from "@/lib/supabase/admin";
import { DeliveryQuoteService } from "@/server/delivery/delivery-quote-service";
import { RoadDistanceUnavailable } from "@/server/delivery/geoapify-distance-provider";

const { quoteCachedRoadDistance } = vi.hoisted(() => ({ quoteCachedRoadDistance: vi.fn() }));
vi.mock("@/server/delivery/road-distance-cache", () => ({ quoteCachedRoadDistance }));

const neighborhood = { fee_cents: 500, minimum_order_cents: null, additional_minutes: 0 };
const address = { street: "Rua Teste", number: "25", district: "Centro", city: "Nova Odessa", state: "SP" };

function quote(storeId: string, district: string, activeNeighborhood: typeof neighborhood | null) {
  const admin = {
    from(table: string) {
      return {
        select() { return this; },
        eq() { return this; },
        is() { return this; },
        maybeSingle: async () => ({ data: table === "delivery_neighborhoods" ? activeNeighborhood : null }),
      };
    },
  } as unknown as ReturnType<typeof createAdminClient>;
  return DeliveryQuoteService.quote({
    admin, organizationId: "organization", storeId, subtotalCents: 2500,
    address: { ...address, district }, useRoadDistance: true,
  });
}

describe("road delivery pilot coverage", () => {
  beforeEach(() => {
    quoteCachedRoadDistance.mockReset();
    vi.stubEnv("GEOAPIFY_PILOT_STORE_ID", "pilot-store");
    vi.stubEnv("GEOAPIFY_PILOT_ORIGIN_LATITUDE", "-22.788276");
    vi.stubEnv("GEOAPIFY_PILOT_ORIGIN_LONGITUDE", "-47.298420");
    vi.stubEnv("GEOAPIFY_API_KEY", "fixture-key");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("uses the road fee in another registered neighborhood", async () => {
    quoteCachedRoadDistance.mockResolvedValue(2416);
    await expect(quote("pilot-store", "Bela Vista", neighborhood)).resolves.toMatchObject({
      serviceable: true, feeCents: 600,
    });
    expect(quoteCachedRoadDistance).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ destination: expect.objectContaining({ district: "Bela Vista" }) }),
      expect.objectContaining({ storeId: "pilot-store" }),
    );
  });

  it("rejects an unregistered neighborhood before calling the route service", async () => {
    await expect(quote("pilot-store", "Bairro fora da área", null)).resolves.toEqual({
      serviceable: false, reason: "neighborhood_not_served",
    });
    expect(quoteCachedRoadDistance).not.toHaveBeenCalled();
  });

  it.each(["address_unverified", "provider_timeout_or_network_error", "route_quota_unavailable"])(
    "blocks pilot delivery without a fee when the route reports %s",
    async (reason) => {
      quoteCachedRoadDistance.mockRejectedValue(new RoadDistanceUnavailable(reason));
      await expect(quote("pilot-store", "Centro", neighborhood)).resolves.toEqual({
        serviceable: false, reason: "route_unavailable",
      });
    },
  );

  it("keeps the neighborhood fee for stores outside the pilot", async () => {
    await expect(quote("other-store", "Centro", neighborhood)).resolves.toMatchObject({
      serviceable: true, feeCents: 500,
    });
    expect(quoteCachedRoadDistance).not.toHaveBeenCalled();
  });
});
