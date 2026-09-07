import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260906060000_omnichannel_external_snapshot_pii_minimization.sql",
  "utf8",
);

const whitelistBuilder = migration.slice(
  migration.indexOf("jsonb_build_object("),
  migration.indexOf("revoke all on function private.integration_minimal_external_order_snapshot"),
);

describe("omnichannel external snapshot PII minimization", () => {
  it("persists a whitelist-only reconciliation snapshot", () => {
    expect(whitelistBuilder).toContain("'externalOrderId'");
    expect(whitelistBuilder).toContain("'money'");
    expect(whitelistBuilder).toContain("'payments'");
    expect(whitelistBuilder).toContain("'itemCount'");
    expect(whitelistBuilder).toContain("'deliveryCode'");
  });

  it("does not whitelist duplicated operational PII or arbitrary provider metadata", () => {
    expect(whitelistBuilder).not.toContain("'customer'");
    expect(whitelistBuilder).not.toContain("'deliveryAddress'");
    expect(whitelistBuilder).not.toContain("'items'");
    expect(whitelistBuilder).not.toContain("'providerMetadata'");
    expect(whitelistBuilder).not.toContain("'cardholderName'");
  });

  it("enforces minimization on both insert and later snapshot updates", () => {
    expect(migration).toContain("before insert or update of last_snapshot");
    expect(migration).toContain("new.last_snapshot := private.integration_minimal_external_order_snapshot(new.last_snapshot)");
    expect(migration).toContain("update public.external_orders");
  });
});
