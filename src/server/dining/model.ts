export type DiningTableStatus = "available" | "occupied" | "reserved" | "cleaning" | "disabled";
export type DiningTabStatus = "open" | "settling" | "closed" | "canceled";

const manualTableTransitions: Record<DiningTableStatus, readonly DiningTableStatus[]> = {
  available: ["reserved", "cleaning", "disabled"],
  occupied: [],
  reserved: ["available", "cleaning", "disabled"],
  cleaning: ["available", "disabled"],
  disabled: ["available"],
};

export function canManuallyTransitionTable(from: DiningTableStatus, to: DiningTableStatus) {
  return from === to || manualTableTransitions[from].includes(to);
}

export function tabBalance(totalCents: number, paidCents: number) {
  if (!Number.isSafeInteger(totalCents) || !Number.isSafeInteger(paidCents) || totalCents < 0 || paidCents < 0 || paidCents > totalCents) {
    throw new Error("Invalid dining balance");
  }
  return totalCents - paidCents;
}

export function occupiedMinutes(openedAt: string | null, nowMs = Date.now()) {
  if (!openedAt) return 0;
  const opened = Date.parse(openedAt);
  if (!Number.isFinite(opened) || opened > nowMs) return 0;
  return Math.floor((nowMs - opened) / 60_000);
}
