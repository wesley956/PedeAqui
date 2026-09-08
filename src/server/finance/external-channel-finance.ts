export type ExternalFinanceRow = {
  order_id: string;
  provider: string;
  payment_owner: string;
  last_snapshot: unknown;
};

export type ExternalFinanceOrder = {
  orderId: string;
  provider: "ifood" | "99food";
  paymentOwner: "provider" | "merchant" | "pedeaqui" | "unknown";
  subtotalCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  additionalFeeCents: number;
  totalCents: number;
  prepaid: boolean | null;
  providerPaymentStatus: string | null;
  expectedMerchantAmountCents: number | null;
  commissionCents: number | null;
  logisticsCostCents: number | null;
};

export type ExternalChannelSummary = {
  provider: "ifood" | "99food";
  orderCount: number;
  totalCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  additionalFeeCents: number;
  providerOwnedCents: number;
  merchantOwnedCents: number;
  expectedMerchantAmountCents: number | null;
  commissionCents: number | null;
  logisticsCostCents: number | null;
};

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function cents(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) return null;
  return value;
}

function firstCents(source: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    const value = cents(source[key]);
    if (value !== null) return value;
  }
  return null;
}

function firstPayment(snapshot: Record<string, unknown>) {
  const payments = Array.isArray(snapshot.payments) ? snapshot.payments : [];
  for (const payment of payments) {
    const row = record(payment);
    return {
      prepaid: typeof row.prepaid === "boolean" ? row.prepaid : null,
      providerStatus: typeof row.providerStatus === "string" && row.providerStatus.trim()
        ? row.providerStatus.trim().slice(0, 80)
        : null,
    };
  }
  return { prepaid: null, providerStatus: null };
}

export function projectExternalFinance(row: ExternalFinanceRow): ExternalFinanceOrder | null {
  if (row.provider !== "ifood" && row.provider !== "99food") return null;
  const snapshot = record(row.last_snapshot);
  const money = record(snapshot.money);
  const metadata = record(snapshot.providerMetadata);
  const payment = firstPayment(snapshot);

  const subtotalCents = cents(money.subtotalCents);
  const deliveryFeeCents = cents(money.deliveryFeeCents);
  const discountCents = cents(money.discountCents);
  const additionalFeeCents = cents(money.additionalFeeCents);
  const totalCents = cents(money.totalCents);
  if ([subtotalCents, deliveryFeeCents, discountCents, additionalFeeCents, totalCents].some((value) => value === null)) return null;

  const paymentOwner = row.payment_owner === "provider" || row.payment_owner === "merchant" || row.payment_owner === "pedeaqui"
    ? row.payment_owner
    : "unknown";

  return {
    orderId: row.order_id,
    provider: row.provider,
    paymentOwner,
    subtotalCents: subtotalCents!,
    deliveryFeeCents: deliveryFeeCents!,
    discountCents: discountCents!,
    additionalFeeCents: additionalFeeCents!,
    totalCents: totalCents!,
    prepaid: payment.prepaid,
    providerPaymentStatus: payment.providerStatus,
    expectedMerchantAmountCents: firstCents(metadata, [
      "expectedMerchantAmountCents",
      "merchantAmountCents",
      "netAmountCents",
    ]),
    commissionCents: firstCents(metadata, ["commissionCents", "providerCommissionCents"]),
    logisticsCostCents: firstCents(metadata, ["logisticsCostCents", "deliveryCostCents"]),
  };
}

function optionalSum(values: Array<number | null>) {
  const available = values.filter((value): value is number => value !== null);
  return available.length === values.length ? available.reduce((sum, value) => sum + value, 0) : null;
}

export function summarizeExternalChannels(rows: ExternalFinanceOrder[]): ExternalChannelSummary[] {
  const providers = ["ifood", "99food"] as const;
  return providers.flatMap((provider) => {
    const orders = rows.filter((row) => row.provider === provider);
    if (orders.length === 0) return [];
    return [{
      provider,
      orderCount: orders.length,
      totalCents: orders.reduce((sum, row) => sum + row.totalCents, 0),
      deliveryFeeCents: orders.reduce((sum, row) => sum + row.deliveryFeeCents, 0),
      discountCents: orders.reduce((sum, row) => sum + row.discountCents, 0),
      additionalFeeCents: orders.reduce((sum, row) => sum + row.additionalFeeCents, 0),
      providerOwnedCents: orders.filter((row) => row.paymentOwner === "provider").reduce((sum, row) => sum + row.totalCents, 0),
      merchantOwnedCents: orders.filter((row) => row.paymentOwner === "merchant").reduce((sum, row) => sum + row.totalCents, 0),
      expectedMerchantAmountCents: optionalSum(orders.map((row) => row.expectedMerchantAmountCents)),
      commissionCents: optionalSum(orders.map((row) => row.commissionCents)),
      logisticsCostCents: optionalSum(orders.map((row) => row.logisticsCostCents)),
    }];
  });
}
