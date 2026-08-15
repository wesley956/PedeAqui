import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const session = readFileSync("src/server/auth/session.ts", "utf8");
const context = readFileSync("src/server/access/context.ts", "utf8");
const navigation = readFileSync("src/server/access/navigation-access-service.ts", "utf8");
const realtime = readFileSync("src/features/orders/order-realtime.tsx", "utf8");
const baseline = readFileSync("docs/performance/PANEL_BASELINE_336.md", "utf8");

describe("panel performance contracts [336]", () => {
  it("deduplicates authentication, tenant context and navigation inside a server request", () => {
    expect(session).toContain('import { cache } from "react"');
    expect(session).toContain("const resolveAuthenticatedUser = cache(");
    expect(context).toContain("const resolveAccessContext = cache(");
    expect(navigation).toContain("const loadNavigationAccess = cache(");
  });

  it("does not introduce a process-global tenant cache", () => {
    for (const source of [session, context, navigation]) {
      expect(source).not.toContain("new Map<");
      expect(source).not.toContain("globalThis");
      expect(source).not.toContain("unstable_cache");
    }
  });

  it("coalesces bursts of realtime order changes before refreshing the route tree", () => {
    expect(realtime).toContain("REFRESH_COALESCE_MS");
    expect(realtime).toContain("refreshTimerRef.current !== null");
    expect(realtime).toContain("window.setTimeout");
    expect(realtime).toContain("window.clearTimeout");
    expect(realtime).not.toContain("() => router.refresh()");
  });

  it("records measured scope without inventing browser latency numbers", () => {
    expect(baseline).toContain("Antes");
    expect(baseline).toContain("Depois");
    expect(baseline).toContain("P50/P75");
    expect(baseline).toContain("não foram inventados");
    expect(baseline).toContain("request-local");
  });
});
