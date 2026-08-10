import { describe, expect, it } from "vitest";
import { normalizePhone } from "@/server/customers/phone";

describe("customer phone normalization", () => {
  it("normalizes a Brazilian formatted phone", () => {
    expect(normalizePhone("(19) 99999-1234")).toBe("19999991234");
  });

  it("allows missing phone", () => {
    expect(normalizePhone(null)).toBeNull();
  });

  it("rejects implausibly short numbers", () => {
    expect(() => normalizePhone("12345")).toThrow("Invalid phone number");
  });
});
