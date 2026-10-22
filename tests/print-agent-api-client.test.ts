import { describe, expect, it, vi } from "vitest";
// @ts-expect-error The standalone agent ships plain JavaScript.
import { createAgentApiClient } from "../print-agent/src/api-client.mjs";

describe("Print Agent credential rejection backoff", () => {
  it.each([401, 403])("suppresses all endpoints for a minute after HTTP %i", async (status) => {
    let time = 0;
    const fetcher = vi.fn().mockResolvedValue(new Response("{}", { status }));
    const post = createAgentApiClient({ apiUrl: "https://example.test", token: "test-token", timeoutMs: 8000, fetcher, now: () => time });
    await expect(post("/api/print-agent/claim")).rejects.toThrow(String(status));
    for (time = 5_000; time < 60_000; time += 5_000) {
      await expect(post("/api/print-agent/claim")).rejects.toThrow("waiting");
      await expect(post("/api/print-agent/order-alerts")).rejects.toThrow("waiting");
      await expect(post("/api/print-agent/heartbeat")).rejects.toThrow("waiting");
    }
    expect(fetcher).toHaveBeenCalledTimes(1);
    fetcher.mockResolvedValueOnce(new Response('{"jobs":[]}', { status: 200 }));
    expect(await post("/api/print-agent/claim")).toEqual({ jobs: [] });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("does not delay or cache successful claims, ACKs or heartbeat", async () => {
    const fetcher = vi.fn().mockImplementation(async () => new Response('{"ok":true}'));
    const post = createAgentApiClient({ apiUrl: "https://example.test", token: "test-token", timeoutMs: 8000, fetcher });
    for (const endpoint of ["claim", "claim", "ack", "heartbeat"]) {
      expect(await post(`/api/print-agent/${endpoint}`, { jobId: "job" })).toEqual({ ok: true });
    }
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(fetcher.mock.calls[2]?.[1]).toMatchObject({ method: "POST", body: '{"jobId":"job"}', headers: { authorization: "Bearer test-token" } });
  });

  it("does not repeat a failed write automatically or turn network/500 errors into credential rejection", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(new Response("{}", { status: 500 }))
      .mockResolvedValueOnce(new Response('{"ok":true}'));
    const post = createAgentApiClient({ apiUrl: "https://example.test", token: "test-token", timeoutMs: 8000, fetcher });
    await expect(post("/api/print-agent/ack")).rejects.toThrow("offline");
    expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(post("/api/print-agent/ack")).rejects.toThrow("500");
    expect(await post("/api/print-agent/ack")).toEqual({ ok: true });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
