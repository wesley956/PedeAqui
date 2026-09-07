import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260906054500_omnichannel_external_discount_compat.sql",
  "utf8",
);

describe("omnichannel external discount compatibility", () => {
  it("keeps the total discount semantic while separating the external share", () => {
    expect(migration).toContain("external_discount_cents bigint");
    expect(migration).toContain("generated always as");
    expect(migration).toContain("when channel in ('ifood','99food') then discount_cents");
  });

  it("extends rather than removes the native growth discount invariant", () => {
    expect(migration).toContain("coupon_discount_cents");
    expect(migration).toContain("cashback_discount_cents");
    expect(migration).toContain("loyalty_discount_cents");
    expect(migration).toContain("+ external_discount_cents");
    expect(migration).toContain("discount_cents = coupon_discount_cents");
  });

  it("leaves native channels with zero external discount by construction", () => {
    expect(migration).toContain("else 0::bigint");
  });
});