import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  normalizeOrderBoardLanes,
  orderBoardWorkflowConfiguration,
  SIMPLIFIED_ORDER_BOARD_LANES,
  STANDARD_ORDER_BOARD_LANES,
} from "@/features/orders/order-board-workflow";

const ordersPage = readFileSync("src/app/(app)/pedidos/page.tsx", "utf8");

describe("omnichannel order board workflow contract", () => {
  it("keeps simplified workflow explicitly at three cards", () => {
    expect(orderBoardWorkflowConfiguration("simplified").lanes).toEqual(["start", "ready", "completed"]);
    expect(SIMPLIFIED_ORDER_BOARD_LANES).toHaveLength(3);
  });

  it("keeps standard workflow explicitly at four operational cards", () => {
    expect(orderBoardWorkflowConfiguration("standard").lanes).toEqual(["new", "preparing", "ready", "queued"]);
    expect(STANDARD_ORDER_BOARD_LANES).toHaveLength(4);
  });

  it("ignores provider-injected lane names instead of reshaping the board", () => {
    expect(normalizeOrderBoardLanes("simplified", ["start", "ifood", "ready", "completed"]))
      .toEqual(["start", "ready", "completed"]);
    expect(normalizeOrderBoardLanes("standard", ["new", "preparing", "99food", "ready", "queued"]))
      .toEqual(["new", "preparing", "ready", "queued"]);
  });

  it("routes the live orders page through the effective configuration resolver", () => {
    expect(ordersPage).toContain("resolveEffectiveStoreConfiguration");
    expect(ordersPage).toContain("orderBoardWorkflowConfiguration");
    expect(ordersPage).toContain("externalCapabilitiesOff()");
    expect(ordersPage).toContain("workflowMode={effectiveBoardWorkflowMode}");
  });
});
