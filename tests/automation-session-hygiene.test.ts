import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/20260918024000_expire_stale_automation_sessions.sql",
);

const migration = fs.readFileSync(migrationPath, "utf8");

describe("INT-EVOL-02 automation session hygiene", () => {
  it("is dry-run by default and bounded", () => {
    expect(migration).toContain("p_limit integer default 200");
    expect(migration).toContain("p_dry_run boolean default true");
    expect(migration).toContain("least(greatest(coalesce(p_limit, 200), 1), 1000)");
    expect(migration).toContain("limit v_limit");
  });

  it("expires only sessions already past expires_at and never deletes records", () => {
    expect(migration).toContain("s.state = 'active'");
    expect(migration).toContain("s.expires_at < now()");
    expect(migration).toContain("set state = 'expired'");
    expect(migration).toContain("version = target.version + 1");
    expect(migration.toLowerCase()).not.toContain("delete from");
  });

  it("keeps execution private to service role", () => {
    expect(migration).toContain("revoke all on function public.automation_sessions_expire_stale_internal(integer, boolean) from public");
    expect(migration).toContain("from anon");
    expect(migration).toContain("from authenticated");
    expect(migration).toContain("to service_role");
  });
});
