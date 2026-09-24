import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("SAAS-06 public promotion projection", () => {
  it("keeps the full promotion schedule RPC server-role only", () => {
    const migration = read("supabase/migrations/20260924064200_saas_06_private_promotion_schedule_rpc.sql");
    expect(migration).toMatch(/revoke all on function public\.get_public_product_promotions\(uuid\) from anon;/i);
    expect(migration).toMatch(/revoke all on function public\.get_public_product_promotions\(uuid\) from authenticated;/i);
    expect(migration).toMatch(/grant execute on function public\.get_public_product_promotions\(uuid\) to service_role;/i);
  });

  it("exposes a separate unprivileged RPC containing only currently active promotion schedules", () => {
    const migration = read("supabase/migrations/20260924064200_saas_06_private_promotion_schedule_rpc.sql");
    expect(migration).toContain("create or replace function public.get_public_active_product_promotions");
    expect(migration).toMatch(/grant execute on function public\.get_public_active_product_promotions\(uuid\) to anon, authenticated, service_role;/i);
    expect(migration).toContain("pp.active = true");
    expect(migration).toContain("now() at time zone s.timezone");
    expect(migration).toContain("local_parts.overnight");
    expect(migration).not.toContain("'organization_id'");
    expect(migration).not.toContain("'store_id'");
    expect(migration).not.toContain("'promotion_group_id'");
  });

  it("keeps public pages free from service-role dependency while revalidating time windows", () => {
    const service = read("src/server/promotions/promotion-service.ts");
    expect(service).toContain('import "server-only"');
    expect(service).toContain('import { createPublicClient } from "@/lib/supabase/public";');
    expect(service).toContain('supabase.rpc("get_public_active_product_promotions"');
    expect(service).toContain("export function isPromotionActive");
    expect(service).toContain("const overnight = start !== null && end !== null && end <= start");
    expect(service).toContain("afterMidnight ? previousWeekday(local.weekday) : local.weekday");
  });

  it("preserves tenant-safe joins and the minimized browser decoration", () => {
    const migration = read("supabase/migrations/20260924064200_saas_06_private_promotion_schedule_rpc.sql");
    const menu = read("src/server/menu/public-menu-service.ts");
    expect(migration).toContain("p.store_id = pp.store_id");
    expect(migration).toContain("p.organization_id = pp.organization_id");
    expect(menu).toContain("isPromotionActive(schedule, menu.store.timezone, now)");
    expect(menu).toContain("promotional_price_cents:");
    expect(menu).toContain("promotion_label:");
    expect(menu).not.toContain("promotion_group_id");
  });
});
