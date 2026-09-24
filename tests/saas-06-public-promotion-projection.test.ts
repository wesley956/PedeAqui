import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("SAAS-06 public promotion projection", () => {
  it("keeps the promotion schedule RPC server-role only", () => {
    const migration = read("supabase/migrations/20260924064200_saas_06_private_promotion_schedule_rpc.sql");
    expect(migration).toMatch(/revoke all on function public\.get_public_product_promotions\(uuid\) from anon;/i);
    expect(migration).toMatch(/revoke all on function public\.get_public_product_promotions\(uuid\) from authenticated;/i);
    expect(migration).toMatch(/grant execute on function public\.get_public_product_promotions\(uuid\) to service_role;/i);
  });

  it("loads promotion schedules only through the server-side admin client", () => {
    const service = read("src/server/promotions/promotion-service.ts");
    expect(service).toContain('import "server-only"');
    expect(service).toContain('import { createAdminClient } from "@/lib/supabase/admin";');
    expect(service).not.toContain("createPublicClient");
    expect(service).toContain('supabase.rpc("get_public_product_promotions"');
  });

  it("preserves the tenant-safe schedule source and canonical time-window calculation", () => {
    const sourceMigration = read("supabase/migrations/20260911180613_promotion_campaigns_v2.sql");
    const service = read("src/server/promotions/promotion-service.ts");
    expect(sourceMigration).toMatch(/security definer/i);
    expect(sourceMigration).toContain("prod.store_id = pp.store_id");
    expect(sourceMigration).toContain("prod.organization_id = pp.organization_id");
    expect(service).toContain("export function isPromotionActive");
    expect(service).toContain("const overnight = start !== null && end !== null && end <= start");
    expect(service).toContain("afterMidnight ? previousWeekday(local.weekday) : local.weekday");
  });

  it("keeps the actual browser projection minimized to the active promotion decoration", () => {
    const menu = read("src/server/menu/public-menu-service.ts");
    expect(menu).toContain("isPromotionActive(schedule, store.timezone, now)");
    expect(menu).toContain("promotional_price_cents:");
    expect(menu).toContain("promotion_label:");
    expect(menu).not.toContain("promotion_group_id");
  });
});
