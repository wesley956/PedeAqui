import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs
  .readFileSync(path.join(process.cwd(), "supabase/sql/182_stabilization_data_integrity_diagnostics.sql"), "utf8")
  .toLowerCase();

describe("stabilization #824 data-integrity diagnostics", () => {
  it("returns only aggregate check metadata without customer PII", () => {
    expect(sql).toContain("check_key");
    expect(sql).toContain("severity");
    expect(sql).toContain("issue_count");
    expect(sql).not.toMatch(/\b(customer_name|phone|email|street|postal_code|access_token)\b/);
  });

  it("covers order/item, delivery, catalog, customer-address and printing invariants", () => {
    for (const check of [
      "order_items_orphan_order",
      "deliveries_orphan_order",
      "deliveries_driver_scope_mismatch",
      "products_category_scope_mismatch",
      "customer_addresses_scope_mismatch",
      "print_jobs_order_scope_mismatch",
      "print_jobs_printer_scope_mismatch",
      "final_fulfillment_open_order",
    ]) {
      expect(sql).toContain(check);
    }
  });

  it("is backend-only and read-only by construction", () => {
    expect(sql).toContain("create or replace function public.run_data_integrity_diagnostics_internal");
    expect(sql).toContain("language sql");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).not.toMatch(/\b(insert|update|delete|truncate)\s+/);
    expect(sql).toMatch(/revoke[\s\S]+from\s+public/);
    expect(sql).toMatch(/revoke[\s\S]+from\s+anon/);
    expect(sql).toMatch(/revoke[\s\S]+from\s+authenticated/);
    expect(sql).toMatch(/grant\s+execute[\s\S]+to\s+service_role/);
  });

  it("marks every reported invariant with an explicit severity for release gating", () => {
    const checks = [...sql.matchAll(/select\s+'([^']+)'(?:::text)?\s*,\s*'([^']+)'(?:::text)?\s*,\s*count\(\*\)::bigint/g)];
    expect(checks.length).toBeGreaterThanOrEqual(10);
    for (const match of checks) {
      const name = match[1];
      const severity = match[2];
      expect(name).toBeTruthy();
      expect(severity).toBeTruthy();
      expect(["critical", "warning", "info"]).toContain(severity);
    }
  });
});
