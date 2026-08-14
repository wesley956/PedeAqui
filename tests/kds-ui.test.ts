import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const board = readFileSync(join(process.cwd(), "src/features/kitchen/kitchen-board.tsx"), "utf8");
const css = readFileSync(join(process.cwd(), "src/features/kitchen/kitchen-board.module.css"), "utf8");
const model = readFileSync(join(process.cwd(), "src/features/kitchen/kitchen-model.ts"), "utf8");

describe("KDS operational UI", () => {
  it("keeps station filtering and realtime refresh", () => {
    expect(board).toContain("filterKitchenOrdersByStation");
    expect(board).toContain("postgres_changes");
    expect(board).toContain("router.refresh()");
  });

  it("shows production actions only through the existing order action flow", () => {
    expect(board).toContain('intent="start_production"');
    expect(board).toContain('intent="mark_ready"');
    expect(board).toContain('order.productionStatus === "preparing"');
  });

  it("keeps elapsed-time attention thresholds explicit rather than calling them an SLA", () => {
    expect(model).toContain("KITCHEN_ATTENTION_MINUTES = 12");
    expect(model).toContain("KITCHEN_LATE_MINUTES = 20");
    expect(board).not.toContain("SLA");
  });

  it("uses a distance-readable responsive and touch-friendly layout", () => {
    expect(css).toContain("clamp(1.75rem,3vw,2.5rem)");
    expect(css).toContain("minmax(340px,1fr)");
    expect(css).toContain("@media(pointer:coarse)");
    expect(css).toContain("var(--control-height-lg)");
  });
});
