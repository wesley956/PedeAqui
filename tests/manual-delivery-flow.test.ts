import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { ModuleKey } from "@/modules/module-catalog";
import { isManualDeliveryMode, isOfflineDeliveryPayment, resolveDeliveryOperationLevel } from "@/modules/manual-delivery";
import { completionBlockers } from "@/features/orders/manager-model";

function modules(...keys: ModuleKey[]) {
  return new Set<ModuleKey>(keys);
}

describe("manual delivery mode", () => {
  it("derives the safest legacy level from modules", () => {
    expect(isManualDeliveryMode(modules("deliveries", "driver"))).toBe(false);
    expect(isManualDeliveryMode(modules("deliveries"))).toBe(false);
    expect(isManualDeliveryMode(modules("driver"))).toBe(true);
    expect(isManualDeliveryMode(modules())).toBe(true);
  });

  it("keeps the restaurant choice within the modules actually available", () => {
    expect(resolveDeliveryOperationLevel("manual", modules("deliveries", "driver"))).toBe("manual");
    expect(resolveDeliveryOperationLevel("advanced", modules("deliveries"))).toBe("dispatch_simple");
    expect(resolveDeliveryOperationLevel("driver_connected", modules())).toBe("manual");
    expect(resolveDeliveryOperationLevel(null, modules("deliveries", "driver"))).toBe("driver_connected");
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
    expect(board).toContain('intent: "manual_finish_delivery", label: paymentPolicy === "quick_confirmation" ? "Receber e finalizar" : "Finalizar pedido"');
  });

  it("does not show finalization blockers before fulfillment is complete", () => {
    const readyForDispatch = {
      order_status: "confirmed" as const,
      payment_status: "pending" as const,
      fulfillment_status: "pending" as const,
    };
    expect(completionBlockers(readyForDispatch)).toEqual([]);
    expect(completionBlockers({ ...readyForDispatch, fulfillment_status: "out_for_delivery" })).toEqual([]);
    expect(completionBlockers({ ...readyForDispatch, fulfillment_status: "delivered" })).toEqual(["pagamento ainda não está liquidado"]);
  });

  it("uses the order flow instead of creating a fake driver", () => {
    const service = readFileSync("src/server/delivery/manual-delivery-service.ts", "utf8");
    expect(service).toContain('manual_delivery_dispatch_internal');
    expect(service).not.toContain("dispatchPath");
    expect(service).not.toContain("createDriver");
    expect(service).not.toContain("driver_id");
  });

  it("persists one truthful manual dispatch transition behind service-role authorization", () => {
    const migration = readFileSync("supabase/migrations/20260902013000_delivery_operation_levels.sql", "utf8");
    expect(migration).toContain("fulfillment_status='out_for_delivery'");
    expect(migration).toContain("v_order.fulfillment_status,'out_for_delivery'");
    expect(migration).not.toContain("fulfillment_status='assigned'");
    expect(migration).not.toContain("fulfillment_status='picked_up'");
    expect(migration).toContain("revoke all on function public.manual_delivery_dispatch_internal(uuid,uuid,text) from public,anon,authenticated");
    expect(migration).toContain("grant execute on function public.manual_delivery_dispatch_internal(uuid,uuid,text) to service_role");
  });

  it("allows only the server role to resolve modules during manual dispatch", () => {
    const migration = readFileSync("supabase/migrations/20260903013000_manual_delivery_private_execution_grant.sql", "utf8");
    expect(migration).toContain("revoke all on function private.store_module_enabled(uuid, uuid, text) from public, anon, authenticated");
    expect(migration).toContain("grant execute on function private.store_module_enabled(uuid, uuid, text) to service_role");
    expect(migration).not.toContain("grant execute on function private.store_module_enabled(uuid, uuid, text) to authenticated");
    expect(migration).not.toContain("grant execute on function private.store_module_enabled(uuid, uuid, text) to anon");
  });
});
