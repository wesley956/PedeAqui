import "server-only";

import { z } from "zod";
import type {
  OnlinePixChargeRequest,
  OnlinePixProviderOrder,
  OnlinePixProviderStatus,
  OrderPaymentProvider,
} from "@/server/payments/providers/order-payment-provider";

const API_BASE = "https://api.mercadopago.com";

const paymentMethodSchema = z.object({
  id: z.string().optional(),
  type: z.string().optional(),
  ticket_url: z.string().nullable().optional(),
  qr_code: z.string().nullable().optional(),
  qr_code_base64: z.string().nullable().optional(),
}).passthrough();

const providerPaymentSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String).nullable().optional(),
  amount: z.union([z.string(), z.number()]).optional(),
  paid_amount: z.union([z.string(), z.number()]).nullable().optional(),
  status: z.string().nullable().optional(),
  status_detail: z.string().nullable().optional(),
  expiration_time: z.string().nullable().optional(),
  date_of_expiration: z.string().nullable().optional(),
  payment_method: paymentMethodSchema.nullable().optional(),
}).passthrough();

const providerOrderSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  external_reference: z.string(),
  total_amount: z.union([z.string(), z.number()]),
  status: z.string(),
  status_detail: z.string().nullable().optional(),
  country_code: z.string().nullable().optional(),
  transactions: z.object({
    payments: z.array(providerPaymentSchema).default([]),
  }).passthrough().optional(),
}).passthrough();

function centsToAmount(cents: number) {
  if (!Number.isSafeInteger(cents) || cents <= 0) throw new Error("Invalid PIX amount");
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

function amountToCents(value: string | number) {
  const raw = String(value).trim();
  const match = raw.match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) throw new Error("Mercado Pago returned an invalid amount");
  const cents = Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  if (!Number.isSafeInteger(cents)) throw new Error("Mercado Pago amount is outside the supported range");
  return cents;
}

function normalizeStatus(status: string, detail: string | null | undefined): OnlinePixProviderStatus {
  const normalized = status.toLowerCase();
  const normalizedDetail = (detail ?? "").toLowerCase();
  if (normalized === "processed" && normalizedDetail === "accredited") return "paid";
  if (normalized === "expired" || normalizedDetail.includes("expired")) return "expired";
  if (normalized === "canceled" || normalized === "cancelled") return "canceled";
  if (normalized === "failed" || normalized === "rejected") return "failed";
  return "pending";
}

function mapOrder(input: unknown): OnlinePixProviderOrder {
  const order = providerOrderSchema.parse(input);
  if (order.country_code && order.country_code !== "BRA") {
    throw new Error("Mercado Pago order is not a Brazilian PIX order");
  }
  const payment = order.transactions?.payments?.[0] ?? null;
  const method = payment?.payment_method ?? null;
  if (method?.id && method.id !== "pix") throw new Error("Mercado Pago order payment method is not PIX");
  const amountCents = amountToCents(payment?.amount ?? order.total_amount);
  return {
    providerOrderId: order.id,
    providerPaymentId: payment?.id ?? null,
    status: normalizeStatus(payment?.status ?? order.status, payment?.status_detail ?? order.status_detail),
    statusDetail: payment?.status_detail ?? order.status_detail ?? null,
    amountCents,
    currency: "BRL",
    externalReference: order.external_reference,
    qrCode: method?.qr_code ?? null,
    qrCodeBase64: method?.qr_code_base64 ?? null,
    ticketUrl: method?.ticket_url ?? null,
    expiresAt: payment?.date_of_expiration ?? payment?.expiration_time ?? null,
  };
}

async function parseResponse(response: Response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const code = body && typeof body === "object" && "code" in body ? String(body.code) : `http_${response.status}`;
    throw new Error(`Mercado Pago request failed (${code})`);
  }
  return body;
}

export class MercadoPagoOrderProvider implements OrderPaymentProvider {
  readonly key = "mercado_pago" as const;

  constructor(private readonly accessToken: string) {
    if (!accessToken.trim()) throw new Error("Mercado Pago access token is missing");
  }

  async createPixCharge(input: OnlinePixChargeRequest): Promise<OnlinePixProviderOrder> {
    if (input.currency !== "BRL") throw new Error("Mercado Pago PIX only supports BRL in PedeAqui");
    const response = await fetch(`${API_BASE}/v1/orders`, {
      method: "POST",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${this.accessToken}`,
        "content-type": "application/json",
        "x-idempotency-key": input.idempotencyKey,
      },
      body: JSON.stringify({
        type: "online",
        total_amount: centsToAmount(input.amountCents),
        external_reference: input.externalReference,
        processing_mode: "automatic",
        transactions: {
          payments: [{
            amount: centsToAmount(input.amountCents),
            payment_method: { id: "pix", type: "bank_transfer" },
            expiration_time: "PT30M",
          }],
        },
        payer: { email: input.payerEmail },
      }),
      cache: "no-store",
    });
    return mapOrder(await parseResponse(response));
  }

  async getOrder(providerOrderId: string): Promise<OnlinePixProviderOrder> {
    const response = await fetch(`${API_BASE}/v1/orders/${encodeURIComponent(providerOrderId)}`, {
      method: "GET",
      headers: {
        accept: "application/json",
        authorization: `Bearer ${this.accessToken}`,
      },
      cache: "no-store",
    });
    return mapOrder(await parseResponse(response));
  }
}
