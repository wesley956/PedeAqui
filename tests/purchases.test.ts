import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) { return readFileSync(join(process.cwd(), path), "utf8").toLowerCase(); }
const core = read("supabase/sql/62_purchases_core.sql");
const operations = read("supabase/sql/63_purchase_operations.sql");
const hardening = read("supabase/sql/64_purchase_idempotency_hardening.sql");
const purchaseService = read("src/server/purchases/purchase-service.ts");
const supplierService = read("src/server/purchases/supplier-service.ts");

describe("purchase schema contracts", () => {
  it("keeps supplier master separate from store terms and exact purchase conversion", () => {
    expect(core).toContain("create table public.suppliers");
    expect(core).toContain("create table public.supplier_stores");
    expect(core).toContain("base_units_per_purchase_unit numeric(18,6)");
    expect(core).not.toContain("double precision");
  });

  it("persists immutable order/receipt history and snapshots", () => {
    expect(core).toContain("purchase_order_history_immutable");
    expect(core).toContain("purchase_receipts_immutable");
    expect(core).toContain("purchase_receipt_items_immutable");
    expect(core).toContain("base_units_per_purchase_unit_snapshot numeric(18,6)");
    expect(operations).toContain("purchase order item snapshots are locked after sending");
  });

  it("keeps purchase tables and internal RPCs server-only", () => {
    expect(core).toContain("enable row level security");
    expect(core).toContain("from anon,authenticated");
    for (const rpc of ["supplier_create_internal","supplier_configure_store_internal","supplier_catalog_upsert_internal","purchase_create_internal","purchase_send_internal","purchase_cancel_internal","purchase_receive_internal","purchase_receipt_correct_internal"]) {
      const source = ["purchase_create_internal","purchase_receive_internal","purchase_receipt_correct_internal"].includes(rpc) ? hardening : operations;
      expect(source).toContain(`revoke all on function public.${rpc}`);
      expect(source).toMatch(new RegExp(`grant execute on function public\\.${rpc}[^;]+to service_role`));
    }
  });
});

describe("purchase transaction contracts", () => {
  it("uses idempotency fingerprints and rejects changed payloads", () => {
    expect(hardening).toContain("request_fingerprint");
    expect(hardening).toContain("extensions.digest");
    expect(hardening).toContain("purchase idempotency key reused with different payload");
    expect(hardening).toContain("receipt idempotency key reused with different payload");
    expect(hardening).toContain("correction idempotency key reused with different payload");
  });

  it("rejects duplicate logical items explicitly", () => {
    expect(hardening).toContain("duplicate purchase inventory item");
    expect(hardening).toContain("duplicate receipt purchase item");
    expect(hardening).toContain("duplicate correction purchase item");
    expect(hardening).toContain("purchase_receipt_items_receipt_order_item_unique");
  });

  it("receives through the existing inventory ledger and updates weighted cost", () => {
    expect(hardening).toContain("private.inventory_insert_movement");
    expect(hardening).toContain("'purchase_receipt'");
    expect(hardening).toContain("v_cost::numeric*1000000::numeric");
    expect(hardening).toContain("base_units_per_purchase_unit_snapshot");
  });

  it("uses purchase for positive correction and adjustment for negative correction", () => {
    expect(hardening).toContain("case when v_delta>0 then 'purchase' else 'adjustment' end");
    expect(hardening).toContain("purchase_receipt_correction");
  });
});

describe("purchase application authorization", () => {
  it("authorizes before admin/service-role data access", () => {
    expect(purchaseService).toContain("authorize(permissions.purchases_view)");
    expect(purchaseService.indexOf("authorize(permissions.purchases_view)")).toBeLessThan(purchaseService.indexOf("createadminclient()"));
    expect(supplierService).toContain("authorize(permissions.suppliers_view)");
    expect(supplierService.indexOf("authorize(permissions.suppliers_view)")).toBeLessThan(supplierService.indexOf("createadminclient()"));
  });

  it("keeps restock suggestions advisory instead of auto-ordering", () => {
    expect(purchaseService).toContain("suggestions");
    expect(purchaseService).not.toContain("auto_create_purchase");
  });
});
