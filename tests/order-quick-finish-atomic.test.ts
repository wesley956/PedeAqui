import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(file, "utf8");

describe("atomic quick finish regression #1206", () => {
  const service = read("src/server/orders/order-quick-finish-service.ts");
  const migration = read("supabase/migrations/20261006034000_order_quick_finish_atomic.sql");

  it("keeps payment confirmation in the audited payment service", () => {
    expect(service).toContain("PaymentService.confirmDefaultForOrder(id)");
    expect(service).toContain('offlinePaymentMethods.has(order.payment_method_snapshot ?? "")');
    expect(service).toContain('order.payment_method_snapshot === "pix"');
  });

  it("collapses operational completion into one database RPC", () => {
    expect(service).toContain('admin.rpc("order_quick_finish_internal"');
    expect(service).not.toContain("OrderService.startProduction");
    expect(service).not.toContain("OrderService.setProduction");
    expect(service).not.toContain("OrderService.setFulfillment");
    expect(service).not.toContain("ManualDeliveryService.dispatch");
    expect(service).not.toContain("ManualDeliveryService.finish");
  });

  it("locks the order and treats an already completed order as a successful retry", () => {
    expect(migration).toContain("for update");
    expect(migration).toContain("if v_order.order_status = 'completed' then");
    expect(migration).toContain("'changed', false");
    expect(migration).toContain("'completed', true");
  });

  it("preserves state-machine transitions, external-order guard and payment gate", () => {
    expect(migration).toContain("public.order_transition_internal");
    expect(migration).toContain("public.order_start_production_internal");
    expect(migration).toContain("public.manual_delivery_dispatch_internal");
    expect(migration).toContain("external orders cannot use quick finish");
    expect(migration).toContain("payment must be settled before quick finish");
  });

  it("keeps the new RPC private to service_role", () => {
    expect(migration).toContain(
      "revoke all on function public.order_quick_finish_internal(uuid,uuid,text) from public, anon, authenticated",
    );
    expect(migration).toContain(
      "grant execute on function public.order_quick_finish_internal(uuid,uuid,text) to service_role",
    );
  });
});
