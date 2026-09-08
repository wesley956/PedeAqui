import type { ExternalSyncState, LogisticsOwner, PaymentOwner } from "@/server/integrations/core/canonical-order";

export type ExternalOrderPresentation = {
  provider: "ifood" | "99food";
  externalOrderId: string;
  externalDisplayId: string | null;
  syncStatus: ExternalSyncState;
  paymentOwner: PaymentOwner;
  prepaid: boolean | null;
  logisticsOwner: LogisticsOwner;
  timing: "immediate" | "scheduled" | null;
  recommendedPreparationAt: string | null;
};

type ExternalOrderLinkRow = {
  provider: string;
  external_order_id: string;
  payment_owner: string;
  logistics_owner: string | null;
  sync_status: string;
  last_snapshot: unknown;
};

function objectValue(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function firstPrepaidPayment(snapshot: Record<string, unknown>) {
  const payments = Array.isArray(snapshot.payments) ? snapshot.payments : [];
  for (const payment of payments) {
    const value = objectValue(payment);
    if (typeof value.prepaid === "boolean") return value.prepaid;
  }
  return null;
}

export function sanitizeExternalOrderPresentation(row: ExternalOrderLinkRow): ExternalOrderPresentation | null {
  if (row.provider !== "ifood" && row.provider !== "99food") return null;
  if (!row.external_order_id.trim()) return null;

  const snapshot = objectValue(row.last_snapshot);
  const syncStatus: ExternalSyncState = ["pending", "synced", "retry", "attention"].includes(row.sync_status)
    ? row.sync_status as ExternalSyncState
    : "attention";
  const paymentOwner: PaymentOwner = ["pedeaqui", "provider", "merchant"].includes(row.payment_owner)
    ? row.payment_owner as PaymentOwner
    : "merchant";
  const logisticsOwner: LogisticsOwner = ["pedeaqui", "merchant", "ifood", "99food", "99entrega"].includes(row.logistics_owner ?? "")
    ? row.logistics_owner as LogisticsOwner
    : null;
  const timing = snapshot.timing === "immediate" || snapshot.timing === "scheduled" ? snapshot.timing : null;

  return {
    provider: row.provider,
    externalOrderId: row.external_order_id,
    externalDisplayId: stringValue(snapshot.externalDisplayId),
    syncStatus,
    paymentOwner,
    prepaid: firstPrepaidPayment(snapshot),
    logisticsOwner,
    timing,
    recommendedPreparationAt: stringValue(snapshot.recommendedPreparationAt),
  };
}

export function orderChannelBadgeLabel(channel: string, external?: ExternalOrderPresentation | null) {
  if (external?.provider === "ifood" || channel === "ifood") return "iFood";
  if (external?.provider === "99food" || channel === "99food") return "99Food";
  return "PedeAqui";
}

export function externalSyncLabel(status: ExternalSyncState) {
  if (status === "synced") return "Sincronizado";
  if (status === "pending") return "Sincronizando…";
  return "Atenção na sincronização";
}

export function externalPaymentLabel(external: ExternalOrderPresentation) {
  if (external.paymentOwner === "provider") {
    if (external.prepaid === true) return `Pago no ${orderChannelBadgeLabel(external.provider, external)}`;
    return `Pagamento pelo ${orderChannelBadgeLabel(external.provider, external)}`;
  }
  if (external.paymentOwner === "pedeaqui") return "Pagamento no PedeAqui";
  return external.prepaid === true ? "Pagamento já realizado" : "Pagamento no restaurante";
}

export function externalLogisticsLabel(external: ExternalOrderPresentation) {
  if (external.logisticsOwner === "ifood") return "Entrega iFood";
  if (external.logisticsOwner === "99food") return "Entrega 99Food";
  if (external.logisticsOwner === "99entrega") return "Entrega 99Entrega";
  if (external.logisticsOwner === "pedeaqui") return "Entrega PedeAqui";
  if (external.logisticsOwner === "merchant") return "Entrega própria";
  return null;
}
