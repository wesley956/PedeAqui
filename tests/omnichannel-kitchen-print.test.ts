import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ExternalOrderPresentation } from "@/features/orders/external-order-presentation";
import {
  externalPrintIdentity,
  prependExternalPrintIdentity,
  withExternalPrintIdentity,
} from "@/server/printing/external-print-presentation";

const external: ExternalOrderPresentation = {
  provider: "ifood",
  externalOrderId: "provider-internal-order-123",
  externalDisplayId: "AB\u0007  12\n34",
  syncStatus: "synced",
  paymentOwner: "provider",
  prepaid: true,
  logisticsOwner: "ifood",
  timing: "immediate",
  recommendedPreparationAt: null,
};

describe("omnichannel kitchen + printing", () => {
  it("keeps the external print identity small and thermal-safe", () => {
    expect(externalPrintIdentity(external)).toEqual({
      provider: "ifood",
      providerLabel: "iFood",
      code: "AB 12 34",
    });

    const rendered = prependExternalPrintIdentity("Pedido 42\n1x Coxinha", external);
    expect(rendered).toContain("Origem: iFood");
    expect(rendered).toContain("Codigo iFood: AB 12 34");
    expect(rendered).toContain("Pedido 42\n1x Coxinha");
    expect(rendered).not.toContain("\u0007");
  });

  it("persists only provider and external display id into the print payload", () => {
    const payload = withExternalPrintIdentity({
      order: { id: "order-1", display_number: 42 },
      items: [{ name: "Coxinha", quantity: 1 }],
    }, external) as Record<string, unknown>;
    const order = payload.order as Record<string, unknown>;

    expect(order.external).toEqual({ provider: "ifood", display_id: "AB 12 34" });
    const serialized = JSON.stringify(payload);
    expect(serialized).not.toContain("provider-internal-order-123");
    expect(serialized).not.toContain("paymentOwner");
    expect(serialized).not.toContain("logisticsOwner");
  });

  it("guards the fallback with existing originals and a dedicated idempotency key", () => {
    const source = readFileSync(join(process.cwd(), "src/server/printing/external-order-print-service.ts"), "utf8");
    expect(source).toContain('.eq("is_reprint", false)');
    expect(source).toContain("external-fallback");
    expect(source).toContain('source: "integration"');
    expect(source).not.toContain('source: "order_confirmed_external_fallback"');
    expect(source).toContain("external_items_without_local_station_mapping");
  });

  it("runs print recovery only after authoritative iFood lifecycle reconciliation", () => {
    const source = readFileSync(join(process.cwd(), "src/server/integrations/providers/ifood/ifood-order-lifecycle-reconciler.ts"), "utf8");
    const reconcile = source.indexOf('db.rpc("integration_reconcile_ifood_order_lifecycle"');
    const fallback = source.indexOf("ExternalOrderPrintService.ensureConfirmedOrder");
    expect(reconcile).toBeGreaterThan(-1);
    expect(fallback).toBeGreaterThan(reconcile);
    expect(source).toContain('milestone !== "canceled"');
  });

  it("keeps production on canonical snapshots without local catalog price lookup", () => {
    const source = readFileSync(join(process.cwd(), "src/server/kitchen/kitchen-service.ts"), "utf8");
    expect(source).toContain('from("order_items")');
    expect(source).toContain('from("order_item_modifiers")');
    expect(source).toContain('from("external_orders")');
    expect(source).not.toContain('from("products").select');
    expect(source).not.toContain("price_cents");
  });
});
