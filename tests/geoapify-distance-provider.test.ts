import { describe, expect, it, vi } from "vitest";
import { queryGeoapifyRoadMeters, RoadDistanceUnavailable } from "@/server/delivery/geoapify-distance-provider";

const address = {
  origin: { latitude: -22.77, longitude: -47.30 },
  destination: { street: "Rua Exemplo", number: "25", district: "Centro", city: "Nova Odessa", state: "SP" },
};

function fakeResponse(body: unknown, status = 200) {
  return { ok: status === 200, json: async () => body } as Response;
}

describe("Geoapify road distance staging adapter", () => {
  it("returns the driving route distance without exposing a fee", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(fakeResponse({ features: [{ properties: { lat: -22.78, lon: -47.31, rank: { confidence: 0.98 } } }] }))
      .mockResolvedValueOnce(fakeResponse({ results: [{ distance: 3400 }] }));
    const meters = await queryGeoapifyRoadMeters(address, { apiKey: "test-key", fetcher });
    expect(meters).toBe(3400);
    expect(fetcher).toHaveBeenCalledTimes(2);
    const routingUrl = fetcher.mock.calls[1][0] as URL;
    expect(routingUrl.searchParams.get("mode")).toBe("drive");
  });

  it("refuses low-confidence geocoding before calling routing", async () => {
    const fetcher = vi.fn().mockResolvedValue(fakeResponse({ features: [{ properties: { lat: -22.78, lon: -47.31, rank: { confidence: 0.35 } } }] }));
    await expect(queryGeoapifyRoadMeters(address, { apiKey: "test-key", fetcher }))
      .rejects.toBeInstanceOf(RoadDistanceUnavailable);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the routing provider is unavailable", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(fakeResponse({ features: [{ properties: { lat: -22.78, lon: -47.31, rank: { confidence: 0.99 } } }] }))
      .mockResolvedValueOnce(fakeResponse({}, 503));
    await expect(queryGeoapifyRoadMeters(address, { apiKey: "test-key", fetcher }))
      .rejects.toThrow("routing_http_error");
  });

  it("does not request an API when the key is missing", async () => {
    const fetcher = vi.fn();
    await expect(queryGeoapifyRoadMeters(address, { apiKey: "", fetcher }))
      .rejects.toThrow("provider_not_configured");
    expect(fetcher).not.toHaveBeenCalled();
  });
});
