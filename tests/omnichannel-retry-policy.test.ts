import { describe, expect, it } from "vitest";
import { IntegrationProviderError, PedeAquiIntegrationError } from "@/server/integrations/core/errors";
import { decideIntegrationRetry } from "@/server/integrations/runtime/retry-policy";

describe("omnichannel retry policy", () => {
  it("retries retryable provider failures with bounded exponential delay", () => {
    const result = decideIntegrationRetry({
      error: new IntegrationProviderError("timeout", "timeout", true),
      attempts: 3,
      now: new Date("2026-09-06T05:00:00.000Z"),
      jitter: 0,
    });

    expect(result.action).toBe("retry");
    if (result.action !== "retry") return;
    expect(result.delayMs).toBe(4_000);
    expect(result.availableAt).toBe("2026-09-06T05:00:04.000Z");
  });

  it("respects Retry-After when it is longer than local backoff", () => {
    const result = decideIntegrationRetry({
      error: new IntegrationProviderError("rate limited", "rate_limit", true),
      attempts: 1,
      now: new Date("2026-09-06T05:00:00.000Z"),
      retryAfterMs: 30_000,
      jitter: 0,
    });

    expect(result.action).toBe("retry");
    if (result.action !== "retry") return;
    expect(result.delayMs).toBe(30_000);
  });

  it("dead-letters non-retryable errors immediately", () => {
    const result = decideIntegrationRetry({
      error: new PedeAquiIntegrationError("invalid canonical payload", "invalid_payload", false),
      attempts: 1,
    });
    expect(result.action).toBe("dead_letter");
  });

  it("dead-letters after the maximum number of attempts", () => {
    const result = decideIntegrationRetry({
      error: new IntegrationProviderError("still unavailable", "provider_5xx", true),
      attempts: 8,
      maxAttempts: 8,
    });
    expect(result.action).toBe("dead_letter");
  });
});
