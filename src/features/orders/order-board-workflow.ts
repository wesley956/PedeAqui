import type { WorkflowConfiguration } from "@/server/integrations/core/effective-store-configuration";

export type BoardWorkflowMode = "standard" | "simplified";

export const STANDARD_ORDER_BOARD_LANES = ["new", "preparing", "ready", "queued"] as const;
export const SIMPLIFIED_ORDER_BOARD_LANES = ["start", "ready", "completed"] as const;

export type StandardOrderBoardLane = (typeof STANDARD_ORDER_BOARD_LANES)[number];
export type SimplifiedOrderBoardLane = (typeof SIMPLIFIED_ORDER_BOARD_LANES)[number];
export type OrderBoardLane = StandardOrderBoardLane | SimplifiedOrderBoardLane;

export function orderBoardWorkflowConfiguration(mode: BoardWorkflowMode): WorkflowConfiguration {
  return mode === "simplified"
    ? { revision: "orders:simplified:v1", lanes: [...SIMPLIFIED_ORDER_BOARD_LANES] }
    : { revision: "orders:standard:v1", lanes: [...STANDARD_ORDER_BOARD_LANES] };
}

export function normalizeOrderBoardLanes(mode: BoardWorkflowMode, lanes: readonly string[]): OrderBoardLane[] {
  const canonical = mode === "simplified" ? SIMPLIFIED_ORDER_BOARD_LANES : STANDARD_ORDER_BOARD_LANES;
  const allowed = new Set<string>(canonical);
  const normalized = lanes.filter((lane, index) => allowed.has(lane) && lanes.indexOf(lane) === index);

  // A malformed or provider-mutated lane set must never partially reshape the board.
  if (normalized.length !== canonical.length) return [...canonical];
  return normalized as OrderBoardLane[];
}
