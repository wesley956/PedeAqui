export type PaymentMethod = "cash" | "pix" | "credit_card" | "debit_card";
export type PaymentRecordStatus = "pending" | "authorized" | "paid" | "failed" | "canceled" | "refunded";

export type PaymentLike = {
  amountCents: number;
  status: PaymentRecordStatus;
};

export function summarizePayments(payments: PaymentLike[], orderTotalCents: number) {
  if (!Number.isSafeInteger(orderTotalCents) || orderTotalCents < 0) throw new Error("Invalid order total");
  let paidCents = 0;
  let reservedCents = 0;
  let failedCents = 0;

  for (const payment of payments) {
    if (!Number.isSafeInteger(payment.amountCents) || payment.amountCents <= 0) throw new Error("Invalid payment amount");
    if (payment.status === "paid") paidCents += payment.amountCents;
    if (["pending", "authorized", "paid"].includes(payment.status)) reservedCents += payment.amountCents;
    if (payment.status === "failed") failedCents += payment.amountCents;
  }

  if (![paidCents, reservedCents, failedCents].every(Number.isSafeInteger)) throw new Error("Payment total overflow");
  return {
    paidCents,
    reservedCents,
    failedCents,
    remainingCents: Math.max(0, orderTotalCents - paidCents),
    availableToReserveCents: Math.max(0, orderTotalCents - reservedCents),
    settled: paidCents === orderTotalCents,
  };
}

export function resolveCashTendered(amountCents: number, configuredCents?: number | null, providedCents?: number | null) {
  const value = providedCents ?? configuredCents ?? amountCents;
  if (![amountCents, value].every(Number.isSafeInteger) || amountCents <= 0 || value < amountCents) {
    throw new Error("Cash received must cover payment amount");
  }
  return { tenderedCents: value, changeDueCents: value - amountCents };
}

export function canReservePayment(orderTotalCents: number, reservedCents: number, amountCents: number) {
  return [orderTotalCents, reservedCents, amountCents].every(Number.isSafeInteger)
    && orderTotalCents >= 0
    && reservedCents >= 0
    && amountCents > 0
    && reservedCents + amountCents <= orderTotalCents;
}
