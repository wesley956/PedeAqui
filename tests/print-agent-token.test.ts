import { describe, expect, it } from "vitest";
import { bearerToken, createPrintAgentToken, derivePrintAgentToken, hashPrintAgentToken } from "@/server/printing/agent-token";
import { effectivePrintHealth } from "@/server/printing/printer-health";

describe("Print Agent credentials", () => {
  it("creates opaque tokens and stores only deterministic sha256 hashes", () => {
    const token = createPrintAgentToken();
    expect(token.length).toBeGreaterThan(30);
    expect(hashPrintAgentToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashPrintAgentToken(token)).toBe(hashPrintAgentToken(token));
  });

  it("derives the same opaque credential for the same intent and rotates for a new intent", () => {
    const agentId = "11111111-1111-4111-8111-111111111111";
    const secret = "server-only-test-secret-that-is-long-enough";
    const firstIntent = "11111111-2222-4333-8444-555555555555";
    const secondIntent = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const first = derivePrintAgentToken(agentId, firstIntent, secret);
    expect(first).toBe(derivePrintAgentToken(agentId, firstIntent, secret));
    expect(first).not.toBe(derivePrintAgentToken(agentId, secondIntent, secret));
    expect(first.length).toBeGreaterThan(30);
    expect(hashPrintAgentToken(first)).toMatch(/^[0-9a-f]{64}$/);
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
