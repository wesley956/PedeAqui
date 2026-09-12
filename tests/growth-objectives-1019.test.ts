import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const wizard = read("src/app/(app)/crescimento/growth-objective-wizard.tsx");
const service = read("src/server/growth/growth-service.ts");
const actions = read("src/features/growth/actions.ts");
const worker = read("src/server/growth/campaign-worker.ts");
const migration = read("supabase/migrations/20260912064500_growth_module_execution_guard_1019.sql");
const canonical = read("supabase/sql/211_growth_module_execution_guard.sql");

describe("growth objective journeys [1019]", () => {
  it("maps every guided objective to an existing canonical server action", () => {
    expect(wizard).toContain("action={createSegmentAction}");
    expect(wizard).toContain("action={createCouponAction}");
    expect(wizard).toContain("action={saveGrowthSettingsAction}");
    expect(wizard).toContain("action={createAutomationAction}");
    expect(wizard).toContain("action={createCampaignAction}");
    expect(wizard).not.toContain("fetch(");
  });

  it("requires explicit review and does not queue or send a preset", () => {
    expect(wizard).toContain("Passo {step} de 3");
    expect(wizard).toContain("Confira antes de criar");
    expect(wizard).toContain("Nada será enviado ao cliente agora");
    expect(wizard).not.toContain("enqueueCampaignAction");
    expect(wizard).not.toContain("scheduleCampaignWorker");
  });

  it("keeps Growth mutations behind permission and module availability", () => {
    expect(service).toContain('await ModuleAccessService.require("growth", context)');
    expect(service).toContain("const context = await authorize(permission)");
    expect(service.match(/authorizeGrowth\(PERMISSIONS\.GROWTH_/g)?.length).toBeGreaterThanOrEqual(11);
  });

  it("suspends existing automations and queued campaigns while Growth is off", () => {
    expect(migration).toBe(canonical);
    expect(migration).toContain("if not private.store_module_enabled(p_rule.organization_id,p_rule.store_id,'growth')");
    expect(migration).toContain("and private.store_module_enabled(cr.organization_id,cr.store_id,'growth')");
    expect(worker).toContain('StoreModuleStateService.isEnabled(job.organization_id, job.store_id, "growth")');
    expect(worker).toContain("growth_module_disabled");
  });

  it("turns relative preset validity into a server timestamp", () => {
    expect(actions).toContain('optionalPositiveInt(formData, "validDays")');
    expect(actions).toContain("validDays * 86_400_000");
    expect(wizard).toContain('name="validDays"');
  });
});
