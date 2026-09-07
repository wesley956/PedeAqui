import type {
  AdapterCommandResult,
  ExternalOrderReference,
  ExternalOrderSnapshot,
  IntegrationEventEnvelope,
  SalesChannelAdapter,
  SalesChannelOrderCommand,
} from "@/server/integrations/core/contracts";
import type { CanonicalExternalOrder } from "@/server/integrations/core/canonical-external-order";
import {
  IntegrationConfigurationError,
  IntegrationProviderError,
} from "@/server/integrations/core/errors";
import type { IfoodOrdersHttpPort } from "@/server/integrations/providers/ifood/ifood-orders-http-client";
import {
  ifoodOrderDetailsSchema,
  ifoodPollingEventSchema,
  normalizeIfoodOrderDetails,
  normalizeIfoodPollingEvent,
} from "@/server/integrations/providers/ifood/ifood-orders-model";

export interface IfoodAccessTokenProvider {
  validAccessToken(organizationId: string, integrationAccountId: string): Promise<string>;
}

export type IfoodSalesAdapterScope = {
  organizationId: string;
  storeId: string;
  integrationAccountId: string;
  externalMerchantId: string;
};

/**
 * iFood implementation of the provider-neutral sales adapter. #939 deliberately
 * implements read/intake only; lifecycle writes stay blocked until #940.
 */
export class IfoodSalesChannelAdapter implements SalesChannelAdapter {
  readonly provider = "ifood" as const;

  constructor(
    private readonly scope: IfoodSalesAdapterScope,
    private readonly http: IfoodOrdersHttpPort,
    private readonly tokenProvider: IfoodAccessTokenProvider,
  ) {
    if (!scope.externalMerchantId.trim()) {
      throw new IntegrationConfigurationError("iFood merchant binding is required", "ifood_merchant_binding_missing");
    }
  }

  async normalizeEvent(input: unknown): Promise<IntegrationEventEnvelope[]> {
    const rows = Array.isArray(input) ? input : [input];
    return rows.map((row) => normalizeIfoodPollingEvent(row, this.scope.externalMerchantId));
  }

  async resolveOrderReference(event: IntegrationEventEnvelope): Promise<ExternalOrderReference | null> {
    const parsed = ifoodPollingEventSchema.safeParse(event.payload);
    if (!parsed.success) {
      throw new IntegrationProviderError("Durable iFood event payload is invalid", "ifood_event_invalid", false, { cause: parsed.error });
    }
    if (!parsed.data.orderId) return null;

    const eventMerchant = event.merchantExternalId?.trim() || this.scope.externalMerchantId;
    if (eventMerchant !== this.scope.externalMerchantId) {
      throw new IntegrationProviderError("iFood event merchant does not match adapter binding", "ifood_event_merchant_mismatch", false);
    }
    return {
      externalOrderId: parsed.data.orderId,
      externalMerchantId: this.scope.externalMerchantId,
    };
  }

  async fetchOrder(externalOrderId: string, merchantExternalId: string): Promise<ExternalOrderSnapshot> {
    if (merchantExternalId !== this.scope.externalMerchantId) {
      throw new IntegrationProviderError("iFood order fetch merchant does not match adapter binding", "ifood_fetch_merchant_mismatch", false);
    }
    const accessToken = await this.tokenProvider.validAccessToken(
      this.scope.organizationId,
      this.scope.integrationAccountId,
    );
    const payload = await this.http.getOrder({ accessToken, orderId: externalOrderId });
    const parsed = ifoodOrderDetailsSchema.safeParse(payload);
    if (!parsed.success) {
      throw new IntegrationProviderError("iFood order details payload is invalid", "ifood_order_payload_invalid", false, { cause: parsed.error });
    }
    if (parsed.data.id !== externalOrderId || parsed.data.merchant.id !== merchantExternalId) {
      throw new IntegrationProviderError("iFood order details identity mismatch", "ifood_order_identity_mismatch", false);
    }
    return {
      provider: "ifood",
      externalOrderId,
      externalMerchantId: merchantExternalId,
      rawStatus: parsed.data.status ?? "UNKNOWN",
      revision: null,
      payload,
    };
  }

  async normalizeOrder(snapshot: ExternalOrderSnapshot): Promise<CanonicalExternalOrder> {
    if (snapshot.provider !== "ifood") {
      throw new IntegrationProviderError("iFood adapter received a non-iFood snapshot", "ifood_snapshot_provider_mismatch", false);
    }
    const order = normalizeIfoodOrderDetails(snapshot.payload, this.scope.externalMerchantId);
    if (order.externalOrderId !== snapshot.externalOrderId) {
      throw new IntegrationProviderError("Normalized iFood order id does not match snapshot", "ifood_normalized_order_mismatch", false);
    }
    return order;
  }

  async executeOrderCommand(_input: {
    externalOrderId: string;
    merchantExternalId: string;
    command: SalesChannelOrderCommand;
    idempotencyKey: string;
    payload?: unknown;
  }): Promise<AdapterCommandResult> {
    void _input;
    throw new IntegrationConfigurationError(
      "iFood lifecycle commands are disabled until OMNI #940",
      "ifood_order_commands_not_enabled",
    );
  }
}
