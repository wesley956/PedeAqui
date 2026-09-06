import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/migrations/20260906050000_omnichannel_runtime_claims.sql", "utf8");

describe("omnichannel runtime persistence contracts", () => {
  it("claims inbox and outbox work atomically without double leasing", () => {
    expect(migration).toContain("for update skip locked");
    expect(migration).toContain("integration_claim_events");
    expect(migration).toContain("integration_claim_outbox");
    expect(migration).toContain("locked_by = p_worker_id");
    expect(migration).toContain("attempts = e.attempts + 1");
    expect(migration).toContain("attempts = o.attempts + 1");
  });

  it("recovers stale processing leases instead of losing work forever", () => {
    expect(migration).toContain("status = 'processing'");
    expect(migration).toContain("make_interval(secs => greatest(p_lease_seconds, 30))");
  });

  it("supports explicit retry and dead-letter terminal handling", () => {
    expect(migration).toContain("'retry', 'dead_letter'");
    expect(migration).toContain("integration_finish_event");
    expect(migration).toContain("integration_finish_outbox");
  });

  it("keeps worker RPCs private to service_role", () => {
    expect(migration).toContain("revoke all on function public.integration_claim_events");
    expect(migration).toContain("grant execute on function public.integration_claim_events(integer, text, integer) to service_role");
    expect(migration).toContain("grant execute on function public.integration_claim_outbox(integer, text, integer) to service_role");
  });

  it("audits manual or reconciliation replay", () => {
    expect(migration).toContain("integration_reprocess_event");
    expect(migration).toContain("'event_reprocessed'");
    expect(migration).toContain("integration_audit_log");
  });
});
