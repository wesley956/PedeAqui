import type { IntegrationProvider } from "@/server/integrations/core/capabilities";
import type { CanonicalExternalOrder } from "@/server/integrations/core/canonical-external-order";

export type IntegrationEventEnvelope<TPayload = unknown> = {
  provider: IntegrationProvider;
  capability: string;
  eventId: string;
  eventType: string;
  occurredAt: string | null;
  receivedAt: string;
  merchantExternalId: string | null;
  payload: TPayload;
};

export type AdapterCommandResult<TData = unknown> = {
  accepted: boolean;
  externalReference: string | null;
  retryable: boolean;
  data?: TData;
};

export type ExternalOrderReference = {
  externalOrderId: string;
  externalMerchantId: string;
};

export type ExternalOrderSnapshot = {
  provider: IntegrationProvider;
  externalOrderId: string;
  externalMerchantId: string;
  rawStatus: string;
  revision: string | null;
  payload: unknown;
};

export type SalesChannelOrderCommand =
  | "confirm"
  | "start_preparation"
  | "mark_ready"
  | "dispatch"
  | "complete"
  | "request_cancellation";

/** Provider-specific HTTP/auth and payload parsing stay behind this boundary. */
export interface SalesChannelAdapter {
  readonly provider: IntegrationProvider;
  normalizeEvent(input: unknown): Promise<IntegrationEventEnvelope[]>;
  resolveOrderReference(event: IntegrationEventEnvelope): Promise<ExternalOrderReference | null>;
  fetchOrder(externalOrderId: string, merchantExternalId: string): Promise<ExternalOrderSnapshot>;
  normalizeOrder(snapshot: ExternalOrderSnapshot): Promise<CanonicalExternalOrder>;
  executeOrderCommand(input: {
    externalOrderId: string;
    merchantExternalId: string;
    command: SalesChannelOrderCommand;
    idempotencyKey: string;
    payload?: unknown;
  }): Promise<AdapterCommandResult>;
}

export type CatalogSnapshot = {
  provider: IntegrationProvider;
  merchantExternalId: string;
  revision: string | null;
  payload: unknown;
};

export interface CatalogAdapter {
  readonly provider: IntegrationProvider;
  fetchCatalog(merchantExternalId: string): Promise<CatalogSnapshot>;
  publishCatalogOperation(input: {
    merchantExternalId: string;
    operation: unknown;
    idempotencyKey: string;
  }): Promise<AdapterCommandResult>;
}

export type LogisticsQuote = {
  provider: IntegrationProvider;
  quoteExternalId: string | null;
  priceCents: number | null;
  expiresAt: string | null;
  payload?: unknown;
};

export type LogisticsJobSnapshot = {
  provider: IntegrationProvider;
  externalJobId: string;
  rawStatus: string;
  trackingUrl: string | null;
  payload?: unknown;
};

export interface LogisticsAdapter {
  readonly provider: IntegrationProvider;
  quote(input: { orderId: string; pickup: unknown; dropoff: unknown }): Promise<LogisticsQuote>;
  createJob(input: {
    orderId: string;
    quoteExternalId?: string | null;
    pickup: unknown;
    dropoff: unknown;
    idempotencyKey: string;
  }): Promise<AdapterCommandResult<LogisticsJobSnapshot>>;
  cancelJob(input: { externalJobId: string; idempotencyKey: string; reason?: string }): Promise<AdapterCommandResult>;
  getJob(externalJobId: string): Promise<LogisticsJobSnapshot>;
}
