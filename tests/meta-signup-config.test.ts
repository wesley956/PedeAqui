import { describe, expect, it } from "vitest";
import { metaNumericId, metaSessionInfoVersion } from "../src/server/conversations/meta-signup-config";
describe("Meta deployment config", () => {
  it("rejects literal Docker env quotes and malformed IDs", () => {
    expect(metaNumericId('"123456"')).toBeNull();
    expect(metaNumericId("abc")).toBeNull();
    expect(metaNumericId(" 123456 ")).toBe("123456");
    expect(metaSessionInfoVersion('"3"')).toBe("3");
    expect(metaSessionInfoVersion("4")).toBe("4");
  });
});
