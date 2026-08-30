export type OnlinePixProviderStatus = "pending" | "paid" | "expired" | "canceled" | "failed";

export type OnlinePixChargeRequest = {
  amountCents: number;
  currency: "BRL";
  externalReference: string;
  idempotencyKey: string;
  payerEmail: string;
  /** ISO 8601 duration. Mercado Pago Pix currently accepts from 30 minutes to 30 days. */
  expirationTime?: string;
};

export type OnlinePixProviderOrder = {
  providerOrderId: string;
  providerPaymentId: string | null;
  status: OnlinePixProviderStatus;
  statusDetail: string | null;
  amountCents: number;
  currency: "BRL";
  externalReference: string;
  qrCode: string | null;
  qrCodeBase64: string | null;
  ticketUrl: string | null;
  expiresAt: string | null;
};

export interface OrderPaymentProvider {
  readonly key: "mercado_pago";
  createPixCharge(input: OnlinePixChargeRequest): Promise<OnlinePixProviderOrder>;
  getOrder(providerOrderId: string): Promise<OnlinePixProviderOrder>;
}
