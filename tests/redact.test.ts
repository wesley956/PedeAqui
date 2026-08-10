import { describe, expect, it } from "vitest";
import { redactSensitive } from "@/server/observability/redact";

describe("redactSensitive", () => {
  it("redacts sensitive values recursively", () => {
    expect(
      redactSensitive({
        email: "cliente@example.com",
        password: "secret-value",
        nested: {
          accessToken: "token-value",
          name: "Cliente",
        },
        items: [{ api_key: "key-value", product: "X-Bacon" }],
      }),
    ).toEqual({
      email: "cliente@example.com",
      password: "[REDACTED]",
      nested: {
        accessToken: "[REDACTED]",
        name: "Cliente",
      },
      items: [{ api_key: "[REDACTED]", product: "X-Bacon" }],
    });
  });

  it("keeps non-sensitive primitive values", () => {
    expect(redactSensitive({ amount: 2990, active: true, note: null })).toEqual({
      amount: 2990,
      active: true,
      note: null,
    });
  });
});
