import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), "utf8");
const board = read("src/features/orders/order-manager-board.tsx");
const css = read("src/features/orders/order-manager.module.css");
const page = read("src/app/(app)/pedidos/page.tsx");

describe("order manager UI [278]", () => {
  it("preserves the existing realtime insert/update refresh contract", () => {
    expect(board).toContain('"postgres_changes"');
    expect(board).toContain('event: "INSERT"');
    expect(board).toContain('event: "UPDATE"');
    expect(board).toContain("router.refresh()");
    expect(board).toContain("supabase.removeChannel(channel)");
  });

  it("keeps all existing operational action intents", () => {
    for (const intent of ["accept", "reject", "start_production", "mark_ready", "mark_paid", "await_pickup", "customer_picked_up", "await_courier", "complete"]) {
      expect(board, intent).toContain(`intent="${intent}"`);
    }
  });

  it("uses the canonical status language and separates history", () => {
    expect(board).toContain("<StatusBadge");
    expect(board).toContain('const activeBuckets = ["new", "preparing", "ready", "late", "queued"]');
    expect(board).toContain("<details className={styles.history}>");
    expect(board).toContain("grouped.history");
  });

  it("uses an adaptive grid instead of the old mandatory horizontal five-lane board", () => {
    expect(css).toContain("repeat(auto-fit, minmax(270px, 1fr))");
    expect(css).toContain("@media (max-width: 640px)");
    expect(css).toContain("grid-template-columns: 1fr");
    expect(board).not.toContain('gridAutoFlow: "column"');
    expect(board).not.toContain('overflowX: "auto"');
  });

  it("removes implementation jargon from the visible orders page", () => {
    expect(page).toContain("<h1>Pedidos</h1>");
    expect(page).not.toContain("mega-status");
    expect(page).not.toContain("Kanban derivado");
  });
});
