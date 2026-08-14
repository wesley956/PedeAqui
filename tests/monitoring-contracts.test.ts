import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { classifyFailure } from "@/server/observability/failure-classification";
import { redactSensitive } from "@/server/observability/redact";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("monitoring and failure contracts [311]", () => {
  it("separates user-correctable failures from retryable dependency failures", () => {
    expect(classifyFailure({ status: 422, code: "validation_failed" })).toMatchObject({ kind: "validation", retryable: false });
    expect(classifyFailure({ status: 401 })).toMatchObject({ kind: "session", retryable: false });
    expect(classifyFailure({ status: 403 })).toMatchObject({ kind: "permission", retryable: false });
    expect(classifyFailure({ status: 409 })).toMatchObject({ kind: "conflict", retryable: false });
    expect(classifyFailure({ status: 429 })).toMatchObject({ kind: "rate_limit", retryable: true });
    expect(classifyFailure({ status: 504 })).toMatchObject({ kind: "timeout", retryable: true });
    expect(classifyFailure({ status: 503 })).toMatchObject({ kind: "dependency", retryable: true });
    expect(classifyFailure(new Error("opaque"))).toMatchObject({ kind: "internal", retryable: false });
  });

  it("keeps credentials redacted before structured logging", () => {
    expect(redactSensitive({ token: "x", password: "y", authorization: "Bearer z", apiKey: "k", safeId: "abc" })).toEqual({
      token: "[REDACTED]",
      password: "[REDACTED]",
      authorization: "[REDACTED]",
      apiKey: "[REDACTED]",
      safeId: "abc",
    });
  });

  it("correlates billing failures without direct console logging", () => {
    const source = read("src/app/api/webhooks/billing/[providerKey]/route.ts");
    expect(source).toContain("getRequestContext()");
    expect(source).toContain('"x-request-id"');
    expect(source).toContain('recordFailure("billing.webhook.failed"');
    expect(source).toContain("failure.retryable?503:400");
    expect(source).not.toContain("console.error");
  });

  it("correlates WhatsApp failures without logging raw webhook payload", () => {
    const source = read("src/app/api/webhooks/whatsapp/route.ts");
    expect(source).toContain("getRequestContext()");
    expect(source).toContain('recordFailure("whatsapp.webhook.failed"');
    expect(source).toContain('"x-request-id"');
    expect(source).not.toMatch(/logger\.(?:error|warn)\([^\n]*rawBody/);
    expect(source).not.toContain("console.error");
  });

  it("documents the shared retry and user-message policy", () => {
    const doc = read("docs/observability/MONITORING_REVIEW_311.md");
    expect(doc).toContain("retryable=true");
    expect(doc).toContain("raw body de webhook");
    expect(doc).toContain("requestId");
    expect(doc).toContain("stack trace");
  });
});
