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

const persistedTopLevelKey = (key: string) => new RegExp(`^\\s{6}'${key}',`, "m");

describe("omnichannel external snapshot PII minimization", () => {
  it("persists a whitelist-only reconciliation snapshot", () => {
    expect(whitelistBuilder).toMatch(persistedTopLevelKey("externalOrderId"));
    expect(whitelistBuilder).toMatch(persistedTopLevelKey("money"));
    expect(whitelistBuilder).toMatch(persistedTopLevelKey("payments"));
    expect(whitelistBuilder).toMatch(persistedTopLevelKey("itemCount"));
    expect(whitelistBuilder).toMatch(persistedTopLevelKey("deliveryCode"));
  });

  it("does not persist duplicated operational PII or arbitrary provider metadata", () => {
    expect(whitelistBuilder).not.toMatch(persistedTopLevelKey("customer"));
    expect(whitelistBuilder).not.toMatch(persistedTopLevelKey("deliveryAddress"));
    expect(whitelistBuilder).not.toMatch(persistedTopLevelKey("items"));
    expect(whitelistBuilder).not.toMatch(persistedTopLevelKey("providerMetadata"));
    expect(whitelistBuilder).not.toMatch(persistedTopLevelKey("cardholderName"));
  });

  it("may inspect item shape only to persist a non-PII item count", () => {
    expect(whitelistBuilder).toContain("jsonb_array_length(p_snapshot->'items')");
    expect(whitelistBuilder).toMatch(persistedTopLevelKey("itemCount"));
  });

  it("enforces minimization on both insert and later snapshot updates", () => {
    expect(migration).toContain("before insert or update of last_snapshot");
    expect(migration).toContain("new.last_snapshot := private.integration_minimal_external_order_snapshot(new.last_snapshot)");
    expect(migration).toContain("update public.external_orders");
  });
});
