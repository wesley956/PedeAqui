export type OnlinePixProviderStatus = "pending" | "paid" | "expired" | "canceled" | "failed";

export type OnlinePixChargeRequest = {
  amountCents: number;
  currency: "BRL";
  externalReference: string;
  idempotencyKey: string;
  payerEmail: string;
  /** Nome do cliente. O PagBank exige; o Mercado Pago ignora. */
  payerName?: string | null;
  /** CPF/CNPJ só com dígitos. O PagBank exige; o Mercado Pago ignora. Nunca é gravado pelo PedeAqui. */
  payerTaxId?: string | null;
  /** URL que o provedor chama quando a cobrança muda. Usada pelo PagBank, que recebe a URL por pedido. */
  notificationUrl?: string | null;
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

export type OrderPaymentProviderKind = "mercado_pago" | "pagbank";

export interface OrderPaymentProvider {
  readonly key: OrderPaymentProviderKind;
  createPixCharge(input: OnlinePixChargeRequest): Promise<OnlinePixProviderOrder>;
  getOrder(providerOrderId: string): Promise<OnlinePixProviderOrder>;
}
