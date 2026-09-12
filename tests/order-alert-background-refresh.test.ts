import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(path.join(process.cwd(), "src/features/orders/use-order-alert.tsx"), "utf8");

describe("order alert background performance", () => {
  it("keeps alert detection active globally while limiting full page refreshes to orders UI", () => {
    expect(source).toContain('const isOrdersPage = pathname === "/pedidos"');
    expect(source).toContain("if (!isOrdersPage || !active || realtimeRefreshTimerRef.current !== null) return;");
    expect(source).toContain('table: "orders"');
    expect(source).toContain("notifyNewOrder(row.display_number, row.id)");
  });

  it("preserves the reliability fallback and background notification path", () => {
    expect(source).toContain("fallbackFastPollMs = 5_000");
    expect(source).toContain("fallbackHealthyPollMs = 30_000");
    expect(source).toContain('/api/order-alert/events');
    expect(source).toContain("showBackgroundNotification(displayNumber)");
    expect(source).toContain("Notification.requestPermission");
    expect(source).toContain('/api/order-alert/presence');
  });
});
