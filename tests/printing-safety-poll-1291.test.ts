import { afterEach, describe, expect, it, vi } from "vitest";
import { readPrintingSafety } from "@/features/printing/printing-safety-poll";

afterEach(() => vi.unstubAllGlobals());
describe("printing health polling transport (#1291)", () => {
  it("never applies a response for another selected store", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ storeId: "other", issues: [] }))));
    await expect(readPrintingSafety("current", new AbortController().signal)).rejects.toThrow("printing_store_changed");
  });
  it("reports failed checks instead of turning them into an empty healthy result", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 503 })));
    await expect(readPrintingSafety("current", new AbortController().signal)).rejects.toThrow("printing_status_unavailable");
  });
  it("uses uncached authenticated same-origin reads and the cancellation signal", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ storeId: "current", issues: [] })));
    vi.stubGlobal("fetch", fetcher);
    const signal = new AbortController().signal;
    expect(await readPrintingSafety("current", signal)).toEqual({ storeId: "current", issues: [] });
    expect(fetcher).toHaveBeenCalledWith("/api/printing/health", { cache: "no-store", signal });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("rejects malformed status payloads instead of crashing the operator panel", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ storeId: "current", issues: [null] }))));
    await expect(readPrintingSafety("current", new AbortController().signal)).rejects.toThrow("printing_status_invalid");
  });
});
