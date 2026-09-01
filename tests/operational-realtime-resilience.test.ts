import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { applyOperationalRowEvent } from "@/features/operations/use-operational-realtime";

type Row = { id: string; created_at: string; order_status: string; value: number };
const active = (row: Row) => row.order_status !== "completed";
const row = (id: string, value: number, orderStatus = "confirmed"): Row => ({ id, value, order_status: orderStatus, created_at: `2026-09-01T00:00:0${value}.000Z` });

describe("realtime operacional resiliente", () => {
  it("atualiza somente a entidade recebida sem duplicar cartões", () => {
    const original = [row("a", 1), row("b", 2)];
    const updated = applyOperationalRowEvent(original, "UPDATE", row("a", 3), active);
    expect(updated).toHaveLength(2);
    expect(updated.find((item) => item.id === "a")?.value).toBe(3);
    expect(updated.find((item) => item.id === "b")).toBe(original[1]);
  });

  it("remove da fila quando o pedido deixa de ser operacional", () => {
    expect(applyOperationalRowEvent([row("a", 1)], "UPDATE", row("a", 2, "completed"), active)).toEqual([]);
  });

  it("possui reconciliação periódica, fallback e estados visíveis", () => {
    const hook = readFileSync("src/features/operations/use-operational-realtime.tsx", "utf8");
    expect(hook).toContain("reconcileEveryMs = 60_000");
    expect(hook).toContain("degradedReconcileMs = 15_000");
    expect(hook).toContain('"connecting" | "connected" | "degraded"');
    expect(hook).toContain('window.addEventListener("online"');
    expect(hook).toContain('document.addEventListener("visibilitychange"');
  });

  it("aplica pedidos diretamente e resolve apenas uma projeção da cozinha", () => {
    const manager = readFileSync("src/features/orders/order-manager-board.tsx", "utf8");
    const kitchen = readFileSync("src/features/kitchen/kitchen-board.tsx", "utf8");
    expect(manager).toContain("useOperationalRealtime");
    expect(manager).not.toContain("router.refresh();");
    expect(kitchen).toContain("resolveKitchenRealtimeOrderAction");
    expect(kitchen).toContain("key={order.id}");
  });
});
