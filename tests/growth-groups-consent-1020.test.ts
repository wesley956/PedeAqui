import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/20260912072000_growth_groups_consent_1020.sql");
const canonical = read("supabase/sql/212_growth_groups_consent.sql");
const service = read("src/server/growth/growth-service.ts");
const growthPage = read("src/app/(app)/crescimento/page.tsx");
const campaignsPage = read("src/app/(app)/crescimento/campanhas/page.tsx");

describe("growth groups and consent [1020]", () => {
  it("keeps the production migration equal to the canonical append-only SQL", () => {
    expect(migration).toBe(canonical);
  });

  it("computes presets and custom groups in one store-scoped aggregate RPC", () => {
    expect(migration).toContain("growth_group_summaries_internal");
    expect(migration).toContain("o.store_id=s.id and o.order_status='completed'");
    expect(migration).toContain("from public.customer_segments cs join target_store");
    for (const preset of ["preset:new", "preset:recurring", "preset:five", "preset:vip", "preset:recent", "preset:inactive15", "preset:inactive30", "preset:inactive60", "preset:inactive90", "preset:cashback", "preset:points", "preset:birthday"]) {
      expect(migration).toContain(preset);
    }
    expect(service.match(/growth_group_summaries_internal/g)).toHaveLength(2);
  });

  it("separates group membership, contact validity and WhatsApp consent", () => {
    expect(migration).toContain("members bigint,eligible_whatsapp bigint,opted_out bigint,not_consented bigint,invalid_contact bigint");
    expect(migration).toContain("p.status='consented' and m.phone_normalized ~ '^[0-9]{8,20}$'");
    expect(migration).toContain("when p.status='opted_out' then 'skipped_opt_out'");
    expect(migration).toContain("opt-out requires explicit customer opt-in to be reversed");
    expect(campaignsPage).toContain("Opt-out sempre prevalece");
  });

  it("prepares only buyers from the campaign store and remains idempotent", () => {
    expect(migration).toContain("o.store_id=v_campaign.store_id");
    expect(migration).toContain("o.order_status='completed'");
    expect(migration.match(/on conflict\(campaign_id,customer_id\) do nothing/g)?.length).toBeGreaterThanOrEqual(2);
  });

  it("shows members and eligible recipients without exposing full phones", () => {
    expect(growthPage).toContain("no grupo / ");
    expect(campaignsPage).toContain("podem receber no WhatsApp");
    expect(campaignsPage).toContain("customer.masked_phone");
    expect(campaignsPage).not.toContain("customer.phone_normalized ??");
    expect(service).toContain("digits.slice(-4)");
  });
});
