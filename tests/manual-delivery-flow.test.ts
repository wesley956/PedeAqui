import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ModuleKey } from "@/modules/module-catalog";
import { isManualDeliveryMode, isOfflineDeliveryPayment } from "@/modules/manual-delivery";

function modules(...keys: ModuleKey[]) {
  return new Set<ModuleKey>(keys);
}

describe("manual delivery mode", () => {
  it("stays managed only when both delivery modules are enabled", () => {
    expect(isManualDeliveryMode(modules("deliveries", "driver"))).toBe(false);
    expect(isManualDeliveryMode(modules("deliveries"))).toBe(true);
    expect(isManualDeliveryMode(modules("driver"))).toBe(true);
    expect(isManualDeliveryMode(modules())).toBe(true);
  });

  it("only auto-confirms payment-at-delivery methods", () => {
    expect(isOfflineDeliveryPayment("cash")).toBe(true);
    expect(isOfflineDeliveryPayment("credit_card")).toBe(true);
    expect(isOfflineDeliveryPayment("debit_card")).toBe(true);
    expect(isOfflineDeliveryPayment("pix")).toBe(false);
  });

  it("keeps saiu para entrega separate from finalization in the simplified board", () => {
    const board = readFileSync("src/features/orders/order-manager-board.tsx", "utf8");
    expect(board).toContain('label: "Em entrega"');
    expect(board).toContain('intent: "manual_out_for_delivery", label: "Saiu para entrega"');
    expect(board).toContain('intent: "manual_finish_delivery", label: "Finalizar pedido"');
  });

  it("uses the order flow instead of creating a fake driver", () => {
    const service = readFileSync("src/server/delivery/manual-delivery-service.ts", "utf8");
    expect(service).toContain('"awaiting_assignment"');
    expect(service).toContain('"assigned"');
    expect(service).toContain('"picked_up"');
    expect(service).toContain('"out_for_delivery"');
    expect(service).not.toContain("createDriver");
    expect(service).not.toContain("driver_id");
  });
});
