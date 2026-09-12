import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { campaignInputSchema, campaignPolicySchema } from "@/server/growth/schemas";

const read = (path: string) => readFileSync(path, "utf8");
const migration = read("supabase/migrations/20260912090000_growth_recurring_campaigns_1021.sql");
const canonical = read("supabase/sql/213_growth_recurring_campaigns.sql");
const worker = read("src/server/growth/campaign-worker.ts");
const route = read("src/app/api/internal/campaign-messages/route.ts");
const page = read("src/app/(app)/crescimento/campanhas/page.tsx");

const base = {
  name: "Promoção", objective: null, channel: "whatsapp" as const, content: "",
  segmentId: null, templateName: "promocao", templateLanguage: "pt_BR",
  includeCustomerNameParameter: false,
};

describe("recurring campaigns [1021]", () => {
  it("keeps the migration equal to canonical SQL", () => expect(migration).toBe(canonical));

  it("validates one-time, daily and weekly schedules", () => {
    expect(campaignInputSchema.parse({ ...base, scheduleType: "now" }).scheduleType).toBe("now");
    expect(campaignInputSchema.parse({ ...base, scheduleType: "daily", localSendTime: "10:30", scheduleStartsOn: "2026-09-12" }).scheduleType).toBe("daily");
    expect(campaignInputSchema.safeParse({ ...base, scheduleType: "weekly", localSendTime: "10:30", scheduleStartsOn: "2026-09-12", recurrenceWeekdays: [] }).success).toBe(false);
    expect(campaignInputSchema.safeParse({ ...base, scheduleType: "once", localSendTime: null, scheduleStartsOn: null }).success).toBe(false);
  });

  it("uses store timezone and creates idempotent occurrence snapshots", () => {
    expect(migration).toContain("at time zone v_timezone");
    expect(migration).toContain("campaign_occurrences_campaign_key_unique");
    expect(migration).toContain("campaign_recipients_occurrence_customer_unique");
    expect(migration).toContain(":occurrence:");
    expect(migration).toContain(":v'||v_campaign.content_version");
    expect(migration).toContain("content_snapshot text not null");
    expect(migration).toContain("content_version=content_version+1");
    expect(migration).toContain("wait for the current occurrence before editing");
  });

  it("runs the scheduler before the existing worker", () => {
    expect(route.indexOf('admin.rpc("growth_schedule_due_campaigns_internal"')).toBeLessThan(route.indexOf("for (let batch"));
    expect(route).toContain("authorizeInternalJob");
  });

  it("suppresses promotions during service, orders and frequency windows", () => {
    for (const contract of ["active_human_conversation", "active_order", "whatsapp_order_active", "daily_limit", "weekly_limit", "minimum_interval", "campaign_paused"]) expect(migration).toContain(contract);
    expect(migration).toContain("customer_position=1");
    expect(migration).toContain("pg_try_advisory_xact_lock");
    expect(worker.match(/deferIfSuppressed/g)?.length).toBeGreaterThanOrEqual(3);
    expect(worker).toContain("campaign_defer_internal");
    expect(worker).toContain("conversation_mark_outbound_result_internal");
  });

  it("keeps anti-spam settings inside safe platform limits", () => {
    expect(campaignPolicySchema.safeParse({ minimumIntervalHours: 0, dailyLimit: 1, weeklyLimit: 3 }).success).toBe(false);
    expect(campaignPolicySchema.safeParse({ minimumIntervalHours: 24, dailyLimit: 4, weeklyLimit: 4 }).success).toBe(false);
    expect(campaignPolicySchema.parse({ minimumIntervalHours: 24, dailyLimit: 1, weeklyLimit: 3 }).weeklyLimit).toBe(3);
    expect(page).toContain("nunca permitem forçar publicidade durante pedido ou atendimento ativo");
  });

  it("provides pause, resume, cancellation and occurrence history", () => {
    expect(page).toContain("Pausar");
    expect(page).toContain("Retomar");
    expect(page).toContain("Cancelar campanha");
    expect(page).toContain("campaign.occurrences.slice");
    expect(migration).toContain("campaign_pause_internal");
  });
});
