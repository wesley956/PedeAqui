import { describe, expect, it } from "vitest";
import { bearerToken, createPrintAgentToken, hashPrintAgentToken } from "@/server/printing/agent-token";
import { effectivePrintHealth } from "@/server/printing/printer-health";

describe("Print Agent credentials", () => {
  it("creates opaque tokens and stores only deterministic sha256 hashes", () => {
    const token = createPrintAgentToken();
    expect(token.length).toBeGreaterThan(30);
    expect(hashPrintAgentToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashPrintAgentToken(token)).toBe(hashPrintAgentToken(token));
  });

  it("accepts only bearer authorization syntax", () => {
    expect(bearerToken("Bearer abc123")).toBe("abc123");
    expect(bearerToken("bearer token-value")).toBe("token-value");
    expect(bearerToken("Basic abc123")).toBeNull();
  });
});

describe("printer heartbeat health", () => {
  it("marks stale online devices offline", () => {
    const now = Date.parse("2026-08-10T20:02:00.000Z");
    expect(effectivePrintHealth("online", "2026-08-10T20:00:00.000Z", now)).toBe("offline");
    expect(effectivePrintHealth("online", "2026-08-10T20:01:30.000Z", now)).toBe("online");
  });
});
