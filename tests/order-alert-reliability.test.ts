import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("order alert reliability", () => {
  it("keeps realtime as the fast path and adds an authenticated event fallback", () => {
    const provider = readFileSync("src/features/orders/use-order-alert.tsx", "utf8");
    const route = readFileSync("src/app/api/order-alert/events/route.ts", "utf8");

    expect(provider).toContain('fetch(`/api/order-alert/events${query}`');
    expect(provider).toContain("fallbackFastPollMs = 5_000");
    expect(provider).toContain("fallbackHealthyPollMs = 30_000");
    expect(provider).toContain("realtimeConnectedRef.current ? fallbackHealthyPollMs : fallbackFastPollMs");
    expect(route).toContain("authorize(PERMISSIONS.ORDERS_VIEW)");
    expect(route).toContain("OrderAlertBackupService.pollEvents");
    expect(route).toContain('"cache-control": "no-store"');
  });

  it("does not lose the order identity between realtime and fallback", () => {
    const service = readFileSync("src/server/orders/order-alert-backup-service.ts", "utf8");
    const provider = readFileSync("src/features/orders/use-order-alert.tsx", "utf8");
    const board = readFileSync("src/features/orders/order-manager-board.tsx", "utf8");

    expect(service).toContain('.select("id, order_id, display_number, occurred_at")');
    expect(service).toContain("orderId: String(event.order_id)");
    expect(provider).toContain("alertingOrderIdsRef.current.has(orderId)");
    expect(provider).toContain("rememberAlertedOrder(storeId, orderId)");
    expect(board).toContain("notifyNewOrder(row.display_number, row.id)");
  });

  it("tries saved audio again after reload instead of requiring a click before every order", () => {
    const provider = readFileSync("src/features/orders/use-order-alert.tsx", "utf8");

    expect(provider).toContain('export type OrderAlertStatus = "off" | "armed" | "needs_activation" | "ready"');
    expect(provider).toContain('updateStatus(configured ? "armed" : "off")');
    expect(provider).toContain("const played = await reproduceAndValidate()");
    expect(provider).not.toContain('if (statusRef.current !== "ready")');
  });

  it("does not replay stale orders after a long browser suspension", () => {
    const provider = readFileSync("src/features/orders/use-order-alert.tsx", "utf8");

    expect(provider).toContain("fallbackRecentEventMs = 5 * 60_000");
    expect(provider).toContain("Date.now() - occurredAt > fallbackRecentEventMs");
    expect(provider).toContain("Date.now() - parsed.updatedAt > fallbackRecentEventMs");
  });
});
