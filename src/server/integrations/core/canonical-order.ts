import type { IntegrationProvider } from "@/server/integrations/core/capabilities";

export const SALES_CHANNELS = ["pedeaqui", "ifood", "99food"] as const;
export type SalesChannel = (typeof SALES_CHANNELS)[number];

export const PAYMENT_OWNERS = ["pedeaqui", "provider", "merchant"] as const;
export type PaymentOwner = (typeof PAYMENT_OWNERS)[number];

export const EXTERNAL_SYNC_STATES = ["pending", "synced", "retry", "attention"] as const;
export type ExternalSyncState = (typeof EXTERNAL_SYNC_STATES)[number];

export type LogisticsOwner = "pedeaqui" | "merchant" | "ifood" | "99food" | "99entrega" | null;

/**
 * Canonical identity/ownership attached to the existing public.orders aggregate.
 * Provider-specific status values never become PedeAqui order states.
 */
export type CanonicalExternalOrderLink = {
  provider: Extract<IntegrationProvider, "ifood" | "99food">;
  externalOrderId: string;
  channel: Exclude<SalesChannel, "pedeaqui">;
  paymentOwner: PaymentOwner;
  logisticsOwner: LogisticsOwner;
  syncState: ExternalSyncState;
  externalStatus: string | null;
  externalRevision: string | null;
};

export type CanonicalOrderIntent =
  | { type: "accept_order" }
  | { type: "reject_order"; reason?: string }
  | { type: "start_production" }
  | { type: "mark_ready" }
  | { type: "dispatch" }
  | { type: "mark_paid" }
  | { type: "complete_order" }
  | { type: "cancel_order"; reason?: string };

/**
 * Adapter mapping output. Mapping tables live inside each provider adapter;
 * unknown provider states must be reconciled/flagged instead of being copied
 * into the internal state machines.
 */
export type ExternalStateMappingResult = {
  intents: CanonicalOrderIntent[];
  terminal: boolean;
  requiresReconciliation: boolean;
  note?: string;
};

export interface ExternalOrderStateMapper<TExternalEvent = unknown> {
  readonly provider: Extract<IntegrationProvider, "ifood" | "99food">;
  map(event: TExternalEvent): ExternalStateMappingResult;
}

export function shouldScheduleNativePix(input: { paymentOwner: PaymentOwner; channel: SalesChannel }) {
  return input.channel === "pedeaqui" && input.paymentOwner === "pedeaqui";
}

export function canonicalExternalLink(input: Omit<CanonicalExternalOrderLink, "syncState"> & { syncState?: ExternalSyncState }) {
  return { ...input, syncState: input.syncState ?? "pending" } satisfies CanonicalExternalOrderLink;
}
