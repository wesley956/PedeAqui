import { describe, expect, it } from "vitest";
import { effectiveMetaSignupStatus } from "../src/features/conversations/meta-signup-status";

const now = Date.parse("2026-11-01T20:00:00Z");
describe("Meta onboarding status follows the latest session", () => {
  it("stops waiting for the expired production-like session", () => {
    expect(effectiveMetaSignupStatus({ status: "awaiting_meta", expires_at: "2026-10-30T01:57:38.232Z" }, now)).toBe("expired");
  });
  it("expires at the exact deadline, not one millisecond later", () => {
    expect(effectiveMetaSignupStatus({ status: "awaiting_meta", expires_at: new Date(now).toISOString() }, now)).toBe("expired");
    expect(effectiveMetaSignupStatus({ status: "awaiting_meta", expires_at: new Date(now + 1).toISOString() }, now)).toBe("awaiting_meta");
  });
  it("keeps a valid session awaiting confirmation across timezone offsets", () => {
    expect(effectiveMetaSignupStatus({ status: "awaiting_meta", expires_at: "2026-11-01T17:01:00-03:00" }, now)).toBe("awaiting_meta");
  });
  it("preserves completed and canceled sessions instead of waiting again", () => {
    for (const status of ["completed", "canceled", "failed", "expired"]) {
      expect(effectiveMetaSignupStatus({ status, expires_at: "2026-10-01T00:00:00Z" }, now)).toBe(status);
    }
  });
  it("does not wait without a session or with an invalid expiration", () => {
    expect(effectiveMetaSignupStatus(null, now)).toBe("not_started");
    expect(effectiveMetaSignupStatus({ status: "awaiting_meta", expires_at: "invalid" }, now)).toBe("expired");
  });
  it("also expires an abandoned server-side completion step", () => {
    expect(effectiveMetaSignupStatus({ status: "health_checking", expires_at: "2026-10-30T00:00:00Z" }, now)).toBe("expired");
  });
});
