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
import { IfoodHttpError } from "@/server/integrations/providers/ifood/ifood-auth-http-client";
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

function cancellationReasonFromPayload(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const reason = (payload as { reason?: unknown }).reason;
  return typeof reason === "string" && reason.trim() ? reason.trim() : null;
}

/** iFood implementation of the provider-neutral sales adapter. */
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

  async executeOrderCommand(input: {
    externalOrderId: string;
    merchantExternalId: string;
    command: SalesChannelOrderCommand;
    idempotencyKey: string;
    payload?: unknown;
  }): Promise<AdapterCommandResult> {
    if (input.merchantExternalId !== this.scope.externalMerchantId) {
      throw new IntegrationProviderError(
        "iFood order command merchant does not match adapter binding",
        "ifood_command_merchant_mismatch",
        false,
      );
    }
    if (!input.externalOrderId.trim()) {
      throw new IntegrationConfigurationError("iFood order id is required", "ifood_order_id_missing");
    }

    const accessToken = await this.tokenProvider.validAccessToken(
      this.scope.organizationId,
      this.scope.integrationAccountId,
    );

    try {
      switch (input.command) {
        case "confirm":
          await this.http.confirmOrder({ accessToken, orderId: input.externalOrderId });
          break;
        case "start_preparation":
          await this.http.startPreparation({ accessToken, orderId: input.externalOrderId });
          break;
        case "mark_ready":
          await this.http.readyToPickup({ accessToken, orderId: input.externalOrderId });
          break;
        case "request_cancellation": {
          const reason = cancellationReasonFromPayload(input.payload);
          if (!reason) {
            throw new IntegrationConfigurationError(
              "Choose a valid iFood cancellation reason",
              "ifood_cancellation_reason_missing",
            );
          }
          const validReasons = await this.http.getCancellationReasons({
            accessToken,
            orderId: input.externalOrderId,
          });
          if (!validReasons.some((item) => item.code === reason)) {
            throw new IntegrationProviderError(
              "The selected iFood cancellation reason is no longer available for this order",
              "ifood_cancellation_reason_invalid",
              false,
            );
          }
          await this.http.requestCancellation({
            accessToken,
            orderId: input.externalOrderId,
            reason,
          });
          break;
        }
        case "dispatch":
        case "complete":
          throw new IntegrationConfigurationError(
            `iFood order command ${input.command} is not enabled in OMNI #940`,
            "ifood_order_command_not_enabled",
          );
      }
    } catch (error) {
      if (error instanceof IfoodHttpError) {
        throw new IntegrationProviderError(
          error.message,
          error.code ?? `ifood_http_${error.status}`,
          error.retryable,
          { cause: error },
        );
      }
      throw error;
    }

    // iFood's lifecycle endpoints accept the request asynchronously. The
    // canonical order remains unchanged until the corresponding polling event
    // is imported, so accepted is intentionally not equivalent to confirmed.
    void input.idempotencyKey;
    return {
      accepted: true,
      externalReference: input.externalOrderId,
      retryable: false,
    };
  }
}
