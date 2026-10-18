import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("primeira tela de cada página no celular (Fase C)", () => {
  it("puts availability results on the first screen", () => {
    const css = read("src/app/(app)/cardapio/disponibilidade/availability-board.module.css");
    expect(css).toContain(".filters { flex-wrap: nowrap; overflow-x: auto;");
    expect(css).toContain(".untilTomorrowHint { display: none; }");
    const board = read("src/app/(app)/cardapio/disponibilidade/availability-board.tsx");
    expect(board.indexOf("Desligue quando algo acabar")).toBeGreaterThan(board.indexOf("visible.products.length > 0"));
  });

  it("shows orders before controls and drops the duplicated labels", () => {
    expect(read("src/features/orders/orders-tabs.tsx")).toContain('label: "Ativos"');
    expect(read("src/app/(app)/pedidos/page.tsx")).not.toContain(">Ver histórico<");
    const css = read("src/features/orders/order-manager.module.css");
    expect(css).toContain(".toolbar [data-test-sound], .toolbarMeta { display: none; }");
    expect(css).toContain(".stageFilters { display: flex; flex-wrap: nowrap; overflow-x: auto;");
    expect(read("src/features/orders/order-manager-board.tsx")).toContain("data-test-sound");
    expect(read("src/features/orders/custom-order-workflow-board.tsx")).toContain("data-test-sound");
  });

  it("keeps modifier groups, deliveries, production and the dashboard compact", () => {
    expect(read("src/app/(app)/cardapio/catalog-management.module.css")).toContain(".groupRuleHint, .orderChip { display: none; }");
    expect(read("src/features/delivery/delivery.module.css")).toContain(".metrics{display:flex;overflow-x:auto;");
    expect(read("src/features/kitchen/kitchen-board.module.css")).toContain(".filters { display: flex; flex: 1 1 100%; flex-wrap: nowrap; overflow-x: auto;");
    expect(read("src/app/(app)/dashboard/dashboard.module.css")).toContain(".readiness>div:first-child p,.readiness .eyebrow{display:none}");
  });

  it("starts the closed-store notice below the sheet close button", () => {
    expect(read("src/app/m/[slug]/produto/[id]/public-product.module.css")).toContain(".sheetForm>[role=alert],.sheetForm>[role=status]{margin:64px 16px 0}");
  });
});
