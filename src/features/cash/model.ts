export type CashMovementType = "opening" | "sale" | "supply" | "withdrawal" | "refund" | "adjustment";
export type CashDirection = "in" | "out";

export type CashMovementProjection = {
  movementType: CashMovementType;
  direction: CashDirection;
  amountCents: number;
};

export const cashMovementLabels: Record<CashMovementType, string> = {
  opening: "Saldo inicial",
  sale: "Venda em dinheiro",
  supply: "Suprimento",
  withdrawal: "Sangria",
  refund: "Estorno",
  adjustment: "Ajuste",
};

export function calculateExpectedCash(movements: readonly CashMovementProjection[]) {
  let total = 0;
  for (const movement of movements) {
    if (!Number.isSafeInteger(movement.amountCents) || movement.amountCents <= 0) throw new Error("Invalid cash movement amount");
    total += movement.direction === "in" ? movement.amountCents : -movement.amountCents;
    if (!Number.isSafeInteger(total) || total < 0) throw new Error("Invalid expected cash balance");
  }
  return total;
}

export function calculateCashDifference(countedCents: number, expectedCents: number) {
  if (!Number.isSafeInteger(countedCents) || !Number.isSafeInteger(expectedCents) || countedCents < 0 || expectedCents < 0) {
    throw new Error("Invalid cash reconciliation");
  }
  const difference = countedCents - expectedCents;
  if (!Number.isSafeInteger(difference)) throw new Error("Unsafe cash difference");
  return difference;
}
