import "server-only";

import { z } from "zod";
import type {
  OnlinePixChargeRequest,
  OnlinePixProviderOrder,
  OnlinePixProviderStatus,
  OrderPaymentProvider,
} from "@/server/payments/providers/order-payment-provider";

/**
 * Pix do pedido pela API de Pedidos do PagBank (https://developer.pagbank.com.br/reference/criar-pedido).
 * O pedido é criado na conta do restaurante (token do PagBank Connect) com um QR Code Pix.
 * Quando o cliente paga, o PagBank adiciona uma cobrança (charge) PAID ao pedido.
 */

const REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_EXPIRATION_MS = 30 * 60 * 1000;

const linkSchema = z.object({ rel: z.string(), href: z.string() }).passthrough();

const qrCodeSchema = z.object({
  id: z.string().optional(),
  expiration_date: z.string().nullable().optional(),
  amount: z.object({ value: z.number().int() }).passthrough(),
  text: z.string().nullable().optional(),
  links: z.array(linkSchema).default([]),
}).passthrough();

const chargeSchema = z.object({
  id: z.string(),
  status: z.string(),
  amount: z.object({
    value: z.number().int(),
    currency: z.string().optional(),
    summary: z.object({ paid: z.number().int().optional() }).passthrough().optional(),
  }).passthrough(),
}).passthrough();

const orderSchema = z.object({
  id: z.string().min(1),
  reference_id: z.string().nullable().optional(),
  qr_codes: z.array(qrCodeSchema).default([]),
  charges: z.array(chargeSchema).default([]),
}).passthrough();

export class PagBankProviderHttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly parameter: string | null;

  constructor(status: number, code: string, parameter: string | null = null) {
    super(`PagBank request failed (${code})`);
    this.name = "PagBankProviderHttpError";
    this.status = status;
    this.code = code;
    this.parameter = parameter;
  }
}

export function pagBankOrdersBase(environment: "test" | "production") {
  return environment === "production" ? "https://api.pagseguro.com" : "https://sandbox.api.pagseguro.com";
}

export function onlyDigits(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

/** Valida CPF pelos dígitos verificadores. */
export function isValidCpf(value: string | null | undefined) {
  const digits = onlyDigits(value);
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
  const check = (length: number) => {
    let sum = 0;
    for (let index = 0; index < length; index += 1) sum += Number(digits[index]) * (length + 1 - index);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return check(9) === Number(digits[9]) && check(10) === Number(digits[10]);
}

/** Data no formato que o PagBank documenta: 2026-10-13T20:15:59-03:00 (horário de Brasília). */
export function pagBankDate(date: Date) {
  const shifted = new Date(date.getTime() - 3 * 60 * 60 * 1000);
  return `${shifted.toISOString().slice(0, 19)}-03:00`;
}

function normalizeStatus(order: z.infer<typeof orderSchema>, expiresAt: string | null, now: Date): { status: OnlinePixProviderStatus; detail: string | null; chargeId: string | null } {
  const paid = order.charges.find((charge) => charge.status.toUpperCase() === "PAID");
  if (paid) return { status: "paid", detail: "PAID", chargeId: paid.id };
  const last = order.charges.at(-1);
  if (last) {
    const status = last.status.toUpperCase();
    if (status === "CANCELED") return { status: "canceled", detail: status, chargeId: last.id };
    if (status === "DECLINED") return { status: "failed", detail: status, chargeId: last.id };
  }
  if (expiresAt) {
    const expiry = new Date(expiresAt).getTime();
    if (Number.isFinite(expiry) && expiry <= now.getTime()) return { status: "expired", detail: "QR_CODE_EXPIRED", chargeId: null };
  }
  return { status: "pending", detail: "WAITING", chargeId: null };
}

export function mapPagBankOrder(input: unknown, now = new Date()): OnlinePixProviderOrder {
  const order = orderSchema.parse(input);
  const qrCode = order.qr_codes[0];
  if (!qrCode) throw new Error("PagBank order has no Pix QR Code");
  const expiresAt = qrCode.expiration_date ?? null;
  const status = normalizeStatus(order, expiresAt, now);
  const paidCharge = status.chargeId ? order.charges.find((charge) => charge.id === status.chargeId) : null;
  if (paidCharge?.amount.currency && paidCharge.amount.currency !== "BRL") throw new Error("PagBank charge currency is not BRL");
  return {
    providerOrderId: order.id,
    providerPaymentId: status.chargeId,
    status: status.status,
    statusDetail: status.detail,
    amountCents: paidCharge?.amount.value ?? qrCode.amount.value,
    currency: "BRL",
    externalReference: order.reference_id ?? "",
    qrCode: qrCode.text ?? null,
    qrCodeBase64: null,
    ticketUrl: qrCode.links.find((link) => link.rel.toUpperCase() === "QRCODE.PNG")?.href ?? null,
    expiresAt,
  };
}

function base64Link(input: unknown) {
  const parsed = orderSchema.safeParse(input);
  if (!parsed.success) return null;
  return parsed.data.qr_codes[0]?.links.find((link) => link.rel.toUpperCase() === "QRCODE.BASE64")?.href ?? null;
}

async function parseResponse(response: Response) {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const first = body && typeof body === "object" && "error_messages" in body && Array.isArray(body.error_messages)
      ? body.error_messages[0] as { code?: unknown; parameter_name?: unknown } | undefined
      : undefined;
    throw new PagBankProviderHttpError(
      response.status,
      first?.code ? String(first.code) : `http_${response.status}`,
      typeof first?.parameter_name === "string" ? first.parameter_name : null,
    );
  }
  return body;
}

/** Lê só o id do pedido do PagBank. O resto do corpo nunca é confiável: o estado vem da consulta autenticada. */
export function parsePagBankNotificationOrderId(rawBody: string) {
  try {
    const body: unknown = JSON.parse(rawBody);
    if (!body || typeof body !== "object") return null;
    const id = "id" in body ? body.id : null;
    return typeof id === "string" && /^ORDE_[A-Za-z0-9-]{1,120}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

export class PagBankOrderProvider implements OrderPaymentProvider {
  readonly key = "pagbank" as const;
  private readonly base: string;
  private readonly fetcher: typeof fetch;
  private readonly notificationUrl: string | null;

  constructor(
    private readonly accessToken: string,
    environment: "test" | "production",
    options: { notificationUrl?: string | null; fetcher?: typeof fetch } = {},
  ) {
    if (!accessToken.trim()) throw new Error("PagBank access token is missing");
    this.base = pagBankOrdersBase(environment);
    this.fetcher = options.fetcher ?? fetch;
    this.notificationUrl = options.notificationUrl ?? null;
  }

  async createPixCharge(input: OnlinePixChargeRequest): Promise<OnlinePixProviderOrder> {
    if (input.currency !== "BRL") throw new Error("PagBank Pix only supports BRL");
    if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) throw new Error("Invalid PIX amount");
    const taxId = onlyDigits(input.payerTaxId);
    if (!isValidCpf(taxId) && taxId.length !== 14) throw new Error("PagBank Pix requires the customer's CPF");
    const minutes = Number(/^PT(\d+)M$/.exec(input.expirationTime ?? "")?.[1] ?? 0);
    const expiresAt = new Date(Date.now() + (minutes > 0 ? minutes * 60 * 1000 : DEFAULT_EXPIRATION_MS));

    const response = await this.fetcher(`${this.base}/orders`, {
      method: "POST",
      headers: this.headers({ "content-type": "application/json", "x-idempotency-key": input.idempotencyKey }),
      body: JSON.stringify({
        reference_id: input.externalReference,
        customer: {
          name: (input.payerName?.trim() || "Cliente").slice(0, 120),
          email: input.payerEmail,
          tax_id: taxId,
        },
        items: [{ reference_id: input.externalReference, name: "Pedido PedeAqui", quantity: 1, unit_amount: input.amountCents }],
        qr_codes: [{ amount: { value: input.amountCents }, expiration_date: pagBankDate(expiresAt) }],
        ...((input.notificationUrl ?? this.notificationUrl) ? { notification_urls: [input.notificationUrl ?? this.notificationUrl] } : {}),
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body = await parseResponse(response);
    const order = mapPagBankOrder(body);
    return { ...order, qrCodeBase64: await this.fetchBase64(base64Link(body)) };
  }

  async getOrder(providerOrderId: string): Promise<OnlinePixProviderOrder> {
    const response = await this.fetcher(`${this.base}/orders/${encodeURIComponent(providerOrderId)}`, {
      method: "GET",
      headers: this.headers(),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    return mapPagBankOrder(await parseResponse(response));
  }

  /** A imagem do QR é opcional: se falhar, o cliente ainda tem o Pix Copia e Cola. */
  private async fetchBase64(href: string | null) {
    if (!href) return null;
    try {
      const url = new URL(href);
      if (!url.hostname.endsWith("pagseguro.com") && !url.hostname.endsWith("pagbank.com.br")) return null;
      const response = await this.fetcher(url.toString(), {
        method: "GET",
        headers: this.headers({ accept: "text/plain" }),
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) return null;
      const text = (await response.text()).trim();
      return /^[A-Za-z0-9+/=]+$/.test(text) && text.length < 200_000 ? text : null;
    } catch {
      return null;
    }
  }

  private headers(extra: Record<string, string> = {}) {
    return { accept: "application/json", authorization: `Bearer ${this.accessToken}`, ...extra };
  }
}
