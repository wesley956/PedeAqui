import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) { return readFileSync(join(process.cwd(), path), "utf8").toLowerCase(); }
const core = read("supabase/sql/52_delivery_operations_core.sql");
const ops = read("supabase/sql/53_delivery_operations.sql");
const quote = read("src/server/delivery/delivery-quote-service.ts");
const checkout = read("src/server/checkout/checkout-service.ts");
const deliveryService = read("src/server/delivery/delivery-service.ts");
const orderActions = read("src/features/orders/actions.ts");

describe("delivery operations database contracts", () => {
  it("keeps order fulfillment as the canonical lifecycle", () => {
    expect(core).toContain("public.deliveries");
    expect(core).not.toContain("fulfillment_status text");
    expect(ops).toContain("order_transition_internal");
    expect(ops).toContain("'fulfillment','assigned'");
    expect(ops).toContain("'fulfillment',p_to_state");
  });

  it("isolates driver reads to assignment while operations require scoped permissions", () => {
    expect(core).toContain("d.user_id=(select auth.uid())");
    expect(core).toContain("delivery.assign");
    expect(core).toContain("delivery.update");
    expect(core).toContain("enable row level security");
    expect(core).toContain("revoke all on table public.drivers, public.deliveries, public.delivery_history from anon, authenticated");
  });

  it("makes assignment and lifecycle retries idempotent before capacity/state checks", () => {
    const existing = ops.indexOf("select * into v_existing from public.delivery_history");
    const capacity = ops.indexOf("driver capacity reached");
    expect(existing).toBeGreaterThan(-1);
    expect(capacity).toBeGreaterThan(existing);
    expect(core).toContain("delivery_history_org_idem_unique");
    expect(ops).toContain("delivery idempotency key reused with different payload");
  });

  it("tracks immutable logistics history", () => {
    expect(core).toContain("delivery_history_immutable");
    expect(core).toContain("delivery history is immutable");
    for (const event of ["assigned", "reassigned", "picked_up", "out_for_delivery", "delivered"]) expect(core).toContain(`'${event}'`);
  });

  it("keeps internal mutation RPCs away from browser roles", () => {
    for (const rpc of ["delivery_create_driver_internal", "delivery_update_driver_internal", "delivery_mark_waiting_internal", "delivery_assign_internal", "delivery_transition_internal"]) {
      expect(ops).toContain(`revoke all on function public.${rpc}`);
      expect(ops).toMatch(new RegExp(`grant execute on function public\\.${rpc}[^;]+to service_role`));
    }
  });
});

describe("authoritative delivery fee contract", () => {
  it("uses one quote service in checkout and delivery settings domain", () => {
    expect(checkout).toContain("deliveryquoteservice.quote");
    expect(deliveryService).toContain("deliveryquoteservice.quote");
    expect(quote).toContain("delivery_neighborhoods");
    expect(quote).toContain("free_delivery_over_cents");
    expect(quote).toContain("minimum_order_cents");
  });

  it("revalidates the address quote when checkout is reviewed", () => {
    expect(checkout).toContain("static async review");
    expect(checkout).toContain("const quote = await this.quotedelivery");
    expect(checkout).toContain("p_delivery_fee_cents: fee");
    expect(checkout).toContain("p_delivery_quote_status: quotestatus");
  });

  it("prevents the old order manager from directly advancing courier lifecycle", () => {
    for (const routedState of ["awaiting_assignment", "assigned", "picked_up", "out_for_delivery", "delivered"]) {
      expect(orderActions).toContain(`\"${routedState}\"`);
    }
    expect(orderActions).toContain("deliveryoperationsservice.markwaiting");
    expect(orderActions).not.toContain("case \"courier_assigned\"");
    expect(orderActions).not.toContain("case \"out_for_delivery\"");
    expect(orderActions).not.toContain("case \"delivered\"");
  });
});
