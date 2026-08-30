import { describe, expect, it } from "vitest";
import { formatStoreDate, formatStoreDateTime } from "@/lib/store-date-time";

describe("store timezone display", () => {
  it("renders UTC timestamps in the store timezone", () => {
    const value = "2026-08-30T18:55:58.682Z";
    const rendered = formatStoreDateTime(value, "America/Sao_Paulo");

    expect(rendered).toContain("30/08/2026");
    expect(rendered).toContain("15:55");
    expect(rendered).not.toContain("18:55");
  });

  it("uses the store timezone when the local calendar day differs from UTC", () => {
    const value = "2026-08-30T01:04:06.610Z";

    expect(formatStoreDate(value, "America/Sao_Paulo")).toContain("29/08/2026");
    expect(formatStoreDate(value, "UTC")).toContain("30/08/2026");
  });

  it("keeps explicit formatting options while enforcing the store timezone", () => {
    const rendered = formatStoreDateTime("2026-08-30T18:55:58.682Z", "America/Sao_Paulo", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });

    expect(rendered).toContain("30/08");
    expect(rendered).toContain("15:55");
  });
});
