import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const sql = fs
  .readFileSync(path.join(process.cwd(), "supabase/sql/182_stabilization_data_integrity_diagnostics.sql"), "utf8")
  .toLowerCase();

describe("stabilization #824 data-integrity diagnostics", () => {
  it("returns only aggregate check metadata without customer PII", () => {
    expect(sql).toContain("check_name");
    expect(sql).toContain("severity");
    expect(sql).toContain("issue_count");
    expect(sql).not.toMatch(/\b(customer_name|phone|email|street|postal_code|access_token)\b/);
  });

  it("covers order/item, delivery, catalog, customer-address and printing invariants", () => {
    expect(sql).toContain("order_items_without_order");
    expect(sql).toContain("terminal_order_with_active_delivery");
    expect(sql).toContain("active_delivery_for_non_delivery_order");
    expect(sql).toContain("order_items_without_product");
    expect(sql).toContain("customer_address_scope_mismatch");
    expect(sql).toContain("pending_print_for_terminal_order");
  });

  it("is backend-only and read-only by construction", () => {
    expect(sql).toContain("create or replace function app_private.stabilization_integrity_report")
    expect(sql).toContain("stable");
    expect(sql).not.toMatch(/\b(insert|update|delete|truncate)\s+/);
    expect(sql).toMatch(/revoke[\s\S]+from\s+public/);
    expect(sql).toMatch(/revoke[\s\S]+from\s+anon/);
    expect(sql).toMatch(/revoke[\s\S]+from\s+authenticated/);
    expect(sql).toMatch(/grant\s+execute[\s\S]+to\s+service_role/);
  });

  it("marks every reported invariant with an explicit severity for release gating", () => {
    const checks = [...sql.matchAll(/select\s+'([^']+)'::text\s+as\s+check_name,\s+'([^']+)'::text\s+as\s+severity/g)];
    expect(checks.length).toBeGreaterThanOrEqual(6);
    for (const [, name, severity] of checks) {
      expect(name.length).toBeGreaterThan(0);
      expect(["critical", "warning", "info"]).toContain(severity);
    }
  });
});
