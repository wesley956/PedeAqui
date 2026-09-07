import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260906055000_omnichannel_external_order_side_effect_guards.sql",
  "utf8",
);

describe("omnichannel external order side-effect guards", () => {
  it("keeps canonical domain events but suppresses only native WhatsApp fanout", () => {
    expect(migration).toContain("from public.external_orders eo");
    expect(migration).toContain("where eo.order_id = new.entity_id");
    expect(migration).toContain("return new;");
    expect(migration).toContain("order_whatsapp_notifications");
  });

  it("is provider-neutral rather than hard-coding a marketplace", () => {
    expect(migration).not.toContain("new.channel in ('ifood','99food')");
    expect(migration).not.toContain("provider = 'ifood'");
  });

  it("retains native order lifecycle notification mappings", () => {
    expect(migration).toContain("when 'order.created' then 'order_received'");
    expect(migration).toContain("when 'payment.paid' then 'payment_paid'");
    expect(migration).toContain("when 'production.ready' then 'pickup_ready'");
    expect(migration).toContain("when 'fulfillment.out_for_delivery' then 'out_for_delivery'");
    expect(migration).toContain("when 'fulfillment.delivered' then 'delivered'");
  });
});