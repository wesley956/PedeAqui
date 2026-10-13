import { timingSafeEqual } from "node:crypto";
import type {
  FiscalArtifacts,
  FiscalCancelResult,
  FiscalDocumentEnvelope,
  FiscalIssueResult,
  FiscalProvider,
  FiscalProviderContext,
  FiscalWebhookEvent,
} from "@/server/fiscal/fiscal-provider";

/**
 * Emissor de NFC-e pela API v2 da Focus NFe (https://doc.focusnfe.com.br).
 *
 * - Autenticação: HTTP Basic com o token da conta Focus como usuário e senha vazia.
 * - Emissão de NFC-e é síncrona: a resposta já diz se a SEFAZ autorizou ou rejeitou.
 * - A referência (`ref`) é estável por documento fiscal do PedeAqui, então repetir a
 *   emissão nunca gera uma segunda nota: se a referência já existir, consultamos.
 * - O certificado A1 e o CSC são do restaurante e ficam cadastrados na conta Focus,
 *   não no PedeAqui.
 */
export const FOCUS_NFE_PROVIDER_KEY = "focus_nfe";

const BASE_URL = {
  production: "https://api.focusnfe.com.br",
  homologation: "https://homologacao.focusnfe.com.br",
  sandbox: "https://homologacao.focusnfe.com.br",
} as const;

/** Formas de pagamento da NFC-e (tPag). */
const PAYMENT_CODES: Record<string, string> = {
  cash: "01",
  credit_card: "03",
  debit_card: "04",
  pix: "17",
  custom: "99",
};

export type FocusFetch = (input: string, init?: RequestInit) => Promise<Response>;

type Money = number;
type FocusItem = {
  numero_item: number;
  codigo_produto: string;
  descricao: string;
  codigo_ncm: string;
  cest?: string;
  cfop: string;
  unidade_comercial: string;
  quantidade_comercial: number;
  valor_unitario_comercial: Money;
  unidade_tributavel: string;
  quantidade_tributavel: number;
  valor_unitario_tributavel: Money;
  valor_bruto: Money;
  valor_desconto?: Money;
  valor_outras_despesas?: Money;
  icms_origem: number;
  icms_situacao_tributaria: string;
};

export type FocusNfcePayload = {
  cnpj_emitente: string;
  data_emissao: string;
  natureza_operacao: string;
  presenca_comprador: 1 | 4;
  modalidade_frete: 9;
  local_destino: 1;
  items: FocusItem[];
  formas_pagamento: Array<{ forma_pagamento: string; valor_pagamento: Money }>;
  nome_destinatario?: string;
  cpf_destinatario?: string;
};

export type FocusNfceResponse = {
  ref?: string;
  status?: string;
  status_sefaz?: string;
  mensagem_sefaz?: string;
  chave_nfe?: string;
  numero?: string;
  serie?: string;
  protocolo?: string;
  numero_protocolo?: string;
  protocolo_nota_fiscal?: { numero_protocolo?: string } | null;
  caminho_xml_nota_fiscal?: string;
  caminho_xml_cancelamento?: string;
  caminho_danfe?: string;
  qrcode_url?: string;
  url_consulta_nf?: string;
  contingencia_offline?: boolean;
  contingencia_offline_efetivada?: boolean;
  codigo?: string;
  mensagem?: string;
  erros?: Array<{ campo?: string; mensagem?: string }>;
};

export class FiscalValidationError extends Error {}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value).trim();
}

function digits(value: unknown) {
  return text(value).replace(/\D/g, "");
}

function cents(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Math.round(number) : 0;
}

function reais(value: number): Money {
  return Math.round(value) / 100;
}

/** Referência estável na Focus para um documento fiscal do PedeAqui. */
export function focusReference(document: Record<string, unknown>) {
  const id = text(document.id);
  if (!id) throw new FiscalValidationError("Documento fiscal sem identificador");
  return `pedeaqui-${id}`;
}

/** Data/hora ISO com o fuso da unidade (a SEFAZ aceita até 5 minutos de diferença). */
export function isoWithOffset(date: Date, offsetMinutes: number) {
  const shifted = new Date(date.getTime() + offsetMinutes * 60_000);
  const sign = offsetMinutes < 0 ? "-" : "+";
  const absolute = Math.abs(offsetMinutes);
  const hh = String(Math.floor(absolute / 60)).padStart(2, "0");
  const mm = String(absolute % 60).padStart(2, "0");
  return `${shifted.toISOString().slice(0, 19)}${sign}${hh}:${mm}`;
}

/** Divide um valor em centavos proporcionalmente aos pesos, sem perder centavos. */
export function apportion(totalCents: number, weights: number[]) {
  const sum = weights.reduce((acc, weight) => acc + weight, 0);
  if (totalCents <= 0 || sum <= 0) return weights.map(() => 0);
  const shares = weights.map((weight) => Math.floor((totalCents * weight) / sum));
  let remainder = totalCents - shares.reduce((acc, share) => acc + share, 0);
  // Os centavos que sobram do arredondamento vão para os últimos itens com peso.
  const order = weights.map((weight, index) => ({ weight, index })).filter((entry) => entry.weight > 0).reverse();
  for (let step = 0; remainder > 0 && order.length > 0; step += 1) {
    const target = order[step % order.length]?.index;
    if (target === undefined) break;
    shares[target] = (shares[target] ?? 0) + 1;
    remainder -= 1;
  }
  return shares;
}

export function buildFocusNfcePayload(envelope: FiscalDocumentEnvelope, options: { now?: Date; utcOffsetMinutes?: number } = {}): FocusNfcePayload {
  const document = envelope.document;
  const issuer = (document.issuer_snapshot ?? {}) as Record<string, unknown>;
  const customer = (document.customer_snapshot ?? {}) as Record<string, unknown>;
  const totals = (document.totals_snapshot ?? {}) as Record<string, unknown>;
  const payload = (document.fiscal_payload ?? {}) as Record<string, unknown>;

  if (text(document.model) && text(document.model) !== "65") {
    throw new FiscalValidationError("O emissor Focus NFe configurado aqui emite apenas NFC-e (modelo 65)");
  }
  const cnpj = digits(issuer.tax_id);
  if (cnpj.length !== 14) throw new FiscalValidationError("Cadastre o CNPJ do emitente no perfil fiscal da unidade");
  if (envelope.items.length === 0) throw new FiscalValidationError("O pedido não tem itens para a nota");

  const missing: string[] = [];
  const lines = envelope.items.map((item, index) => {
    const fiscal = (item.fiscal_snapshot ?? {}) as Record<string, unknown>;
    const name = text(item.description) || `Item ${index + 1}`;
    const ncm = digits(fiscal.ncm);
    const cfop = digits(fiscal.cfop);
    const cst = digits(fiscal.cst_csosn);
    if (fiscal.missing_profile === true || ncm.length !== 8 || cfop.length !== 4 || cst.length < 2) missing.push(name);
    const quantity = Number(item.quantity ?? 1) || 1;
    const lineTotal = cents(item.total_cents);
    const unit = cents(item.unit_price_cents) || Math.round(lineTotal / quantity);
    const taxData = (fiscal.tax_data ?? {}) as Record<string, unknown>;
    return { item, fiscal, name, ncm, cfop, cst, quantity, lineTotal, unit, origin: Number(taxData.icms_origem ?? 0) || 0 };
  });
  if (missing.length > 0) {
    throw new FiscalValidationError(`Complete NCM, CFOP e CST/CSOSN no cadastro fiscal de: ${missing.slice(0, 5).join(", ")}${missing.length > 5 ? ` e mais ${missing.length - 5}` : ""}`);
  }

  const weights = lines.map((line) => line.lineTotal);
  const discounts = apportion(cents(totals.discount_cents), weights);
  const deliveryFees = apportion(cents(totals.delivery_fee_cents), weights);

  const items: FocusItem[] = lines.map((line, index) => {
    const entry: FocusItem = {
      numero_item: index + 1,
      codigo_produto: text(line.item.product_id).slice(0, 60) || `ITEM${index + 1}`,
      descricao: line.name.slice(0, 120),
      codigo_ncm: line.ncm,
      cfop: line.cfop,
      unidade_comercial: "UN",
      quantidade_comercial: line.quantity,
      valor_unitario_comercial: reais(line.unit),
      unidade_tributavel: "UN",
      quantidade_tributavel: line.quantity,
      valor_unitario_tributavel: reais(line.unit),
      valor_bruto: reais(line.lineTotal),
      icms_origem: line.origin,
      icms_situacao_tributaria: line.cst,
    };
    const cest = digits(line.fiscal.cest);
    if (cest) entry.cest = cest;
    const discount = discounts[index] ?? 0;
    const deliveryFee = deliveryFees[index] ?? 0;
    if (discount > 0) entry.valor_desconto = reais(discount);
    if (deliveryFee > 0) entry.valor_outras_despesas = reais(deliveryFee);
    return entry;
  });

  const totalCents = lines.reduce((acc, line) => acc + line.lineTotal, 0) - cents(totals.discount_cents) + cents(totals.delivery_fee_cents);
  const payments = (Array.isArray(document.payments) ? document.payments : []) as Array<Record<string, unknown>>;
  const paid = payments.filter((payment) => cents(payment.amount_cents) > 0);
  const formas = paid.length > 0
    ? paid.map((payment) => ({ forma_pagamento: PAYMENT_CODES[text(payment.method)] ?? "99", valor_pagamento: reais(cents(payment.amount_cents)) }))
    : [{ forma_pagamento: "99", valor_pagamento: reais(totalCents) }];

  const body: FocusNfcePayload = {
    cnpj_emitente: cnpj,
    data_emissao: isoWithOffset(options.now ?? new Date(), options.utcOffsetMinutes ?? -180),
    natureza_operacao: "VENDA AO CONSUMIDOR",
    presenca_comprador: text(payload.fulfillment_type) === "delivery" ? 4 : 1,
    modalidade_frete: 9,
    local_destino: 1,
    items,
    formas_pagamento: formas,
  };
  const cpf = digits(customer.tax_id ?? customer.cpf);
  if (cpf.length === 11) {
    body.cpf_destinatario = cpf;
    const name = text(customer.name);
    if (name) body.nome_destinatario = name.slice(0, 60);
  }
  return body;
}

function sefazMessage(response: FocusNfceResponse) {
  const parts = [response.status_sefaz, response.mensagem_sefaz ?? response.mensagem].filter(Boolean);
  const fields = (response.erros ?? []).map((error) => [error.campo, error.mensagem].filter(Boolean).join(": ")).filter(Boolean);
  return [parts.join(" "), ...fields].filter(Boolean).join(" · ") || "Rejeitada pela SEFAZ sem mensagem";
}

function accessKeyOf(response: FocusNfceResponse) {
  return text(response.chave_nfe).replace(/^NFe/i, "");
}

function protocolOf(response: FocusNfceResponse) {
  return text(response.protocolo) || text(response.numero_protocolo) || text(response.protocolo_nota_fiscal?.numero_protocolo) || null;
}

/** Traduz a resposta da Focus para o resultado do contrato fiscal do PedeAqui. */
export function mapFocusIssueResponse(reference: string, response: FocusNfceResponse): FiscalIssueResult {
  const status = text(response.status);
  if (response.contingencia_offline === true && status !== "erro_autorizacao") {
    return { status: "contingency", providerDocumentId: reference, code: response.status_sefaz ?? null, message: response.mensagem_sefaz ?? "Emitida em contingência offline" };
  }
  if (status === "autorizado") {
    const accessKey = accessKeyOf(response);
    return {
      status: "authorized",
      providerDocumentId: reference,
      accessKey,
      // A resposta simples da Focus não traz o protocolo; o issue busca a consulta completa antes de chegar aqui.
      protocol: protocolOf(response) ?? `SEFAZ ${response.status_sefaz ?? "100"} · nº ${response.numero ?? "?"}/${response.serie ?? "?"}`,
      code: response.status_sefaz ?? null,
      message: response.mensagem_sefaz ?? null,
    };
  }
  if (status === "processando_autorizacao") return { status: "processing", providerDocumentId: reference, code: null, message: "Aguardando a SEFAZ" };
  if (status === "erro_autorizacao" || status === "denegado" || status === "cancelado") {
    return { status: "rejected", providerDocumentId: reference, code: response.status_sefaz ?? null, message: sefazMessage(response) };
  }
  return { status: "rejected", providerDocumentId: reference, code: response.codigo ?? null, message: sefazMessage(response) };
}

export function mapFocusWebhook(body: FocusNfceResponse): FiscalWebhookEvent[] {
  const reference = text(body.ref);
  const status = text(body.status);
  if (!reference || !status) return [];
  const map: Record<string, FiscalWebhookEvent["status"]> = {
    autorizado: "authorized",
    cancelado: "cancelled",
    erro_autorizacao: "rejected",
    denegado: "rejected",
    processando_autorizacao: "processing",
  };
  const target = body.contingencia_offline === true && status === "autorizado" && body.contingencia_offline_efetivada !== true ? "contingency" : map[status];
  if (!target) return [];
  return [{
    externalEventId: `${reference}:${status}:${body.status_sefaz ?? ""}`,
    providerDocumentId: reference,
    accessKey: accessKeyOf(body) || null,
    status: target,
    protocol: target === "authorized" ? protocolOf(body) ?? `SEFAZ ${body.status_sefaz ?? "100"}` : null,
    cancellationProtocol: target === "cancelled" ? protocolOf(body) ?? `SEFAZ ${body.status_sefaz ?? "135"}` : null,
    code: body.status_sefaz ?? null,
    message: target === "rejected" ? sefazMessage(body) : body.mensagem_sefaz ?? null,
    metadata: { danfe_path: body.caminho_danfe ?? null, qrcode_url: body.qrcode_url ?? null },
  }];
}

/** Justificativa de cancelamento: a SEFAZ exige de 15 a 255 caracteres. */
export function cancellationReason(reason: string) {
  const clean = reason.replace(/\s+/g, " ").trim();
  const padded = clean.length >= 15 ? clean : `${clean ? `${clean} - ` : ""}Cancelamento solicitado pelo estabelecimento`;
  return padded.slice(0, 255);
}

export class FocusNfeProvider implements FiscalProvider {
  readonly key = FOCUS_NFE_PROVIDER_KEY;

  constructor(private readonly fetcher: FocusFetch = (input, init) => fetch(input, init)) {}

  private baseUrl(context: FiscalProviderContext) {
    const override = text(context.config.baseUrl);
    return override || BASE_URL[context.environment];
  }

  private headers(context: FiscalProviderContext) {
    if (!context.secret) throw new Error("Token da Focus NFe não configurado (secret_ref da integração fiscal)");
    return {
      authorization: `Basic ${Buffer.from(`${context.secret}:`).toString("base64")}`,
      "content-type": "application/json",
      accept: "application/json",
    };
  }

  private async call(context: FiscalProviderContext, method: string, path: string, body?: unknown) {
    const response = await this.fetcher(`${this.baseUrl(context)}${path}`, {
      method,
      headers: this.headers(context),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
    const raw = await response.text();
    let json: FocusNfceResponse = {};
    try { json = raw ? (JSON.parse(raw) as FocusNfceResponse) : {}; } catch { json = { mensagem: raw.slice(0, 300) }; }
    // 401/403/5xx: problema de conta, permissão ou instabilidade. O worker tenta de novo com espera.
    if (response.status === 401 || response.status === 403) throw new Error(`Focus NFe recusou o acesso (${response.status}): ${json.mensagem ?? "verifique o token e a empresa emitente"}`);
    if (response.status >= 500) throw new Error(`Focus NFe indisponível (${response.status})`);
    return { status: response.status, json };
  }

  async query(reference: string, context: FiscalProviderContext) {
    const { status, json } = await this.call(context, "GET", `/v2/nfce/${encodeURIComponent(reference)}?completa=1`);
    if (status === 404) return null;
    return json;
  }

  private async artifacts(context: FiscalProviderContext, path?: string): Promise<FiscalArtifacts | null> {
    if (!path) return null;
    try {
      const file = await this.fetcher(`${this.baseUrl(context)}${path}`, { headers: { authorization: this.headers(context).authorization }, signal: AbortSignal.timeout(30_000) });
      if (!file.ok) return null;
      return { xml: await file.text(), danfePdf: null };
    } catch {
      return null;
    }
  }

  async issue(envelope: FiscalDocumentEnvelope, context: FiscalProviderContext): Promise<FiscalIssueResult> {
    const reference = focusReference(envelope.document);
    let payload: FocusNfcePayload;
    try {
      payload = buildFocusNfcePayload(envelope, { utcOffsetMinutes: Number(context.config.utcOffsetMinutes ?? -180) });
    } catch (error) {
      if (error instanceof FiscalValidationError) return { status: "rejected", providerDocumentId: null, code: "pedeaqui_validacao", message: error.message };
      throw error;
    }

    // Retentativa segura: se a referência já existe na Focus, consulta em vez de emitir de novo.
    // Uma nota rejeitada pode ser reenviada com a mesma referência depois de corrigida.
    const existing = await this.query(reference, context);
    const reusable = existing && ["autorizado", "processando_autorizacao", "cancelado", "denegado"].includes(text(existing.status));
    let response = reusable ? existing : null;
    if (!response) {
      const created = await this.call(context, "POST", `/v2/nfce?ref=${encodeURIComponent(reference)}`, payload);
      response = created.json;
      if (created.status === 422 || created.status === 400 || created.status === 415) {
        const again = await this.query(reference, context);
        if (again && text(again.status)) response = again;
        else return { status: "rejected", providerDocumentId: reference, code: response.codigo ?? String(created.status), message: sefazMessage(response) };
      }
    }

    if (text(response.status) === "autorizado" && !protocolOf(response)) {
      const complete = await this.query(reference, context);
      if (complete) response = { ...response, ...complete };
    }
    const result = mapFocusIssueResponse(reference, response);
    if (result.status === "authorized") {
      const artifacts = await this.artifacts(context, response.caminho_xml_nota_fiscal);
      return { ...result, artifacts };
    }
    return result;
  }

  async cancel(input: FiscalDocumentEnvelope & { reason: string }, context: FiscalProviderContext): Promise<FiscalCancelResult> {
    const reference = text(input.document.provider_document_id) || focusReference(input.document);
    const { status, json } = await this.call(context, "DELETE", `/v2/nfce/${encodeURIComponent(reference)}`, { justificativa: cancellationReason(input.reason) });
    let response = json;
    if (text(response.status) !== "cancelado") {
      const current = await this.query(reference, context);
      if (current && text(current.status) === "cancelado") response = current;
      else throw new Error(`Cancelamento recusado (${status}): ${sefazMessage(response)}`);
    }
    const artifacts = await this.artifacts(context, response.caminho_xml_cancelamento);
    return {
      status: "cancelled",
      cancellationProtocol: protocolOf(response) ?? `SEFAZ ${response.status_sefaz ?? "135"}`,
      code: response.status_sefaz ?? null,
      message: response.mensagem_sefaz ?? null,
      artifacts,
    };
  }

  /**
   * A Focus envia no webhook o cabeçalho configurado no gatilho (POST /v2/hooks com
   * `authorization` e `authorization_header`). Conferimos esse valor com o secret do webhook.
   */
  verifyWebhook(_rawBody: string, headers: Headers, context: FiscalProviderContext) {
    const headerName = text(context.config.webhookHeader) || "authorization";
    const received = Buffer.from(text(headers.get(headerName)));
    const expected = Buffer.from(text(context.secret));
    return expected.length > 0 && received.length === expected.length && timingSafeEqual(received, expected);
  }

  parseWebhook(rawBody: string) {
    let body: FocusNfceResponse;
    try { body = JSON.parse(rawBody) as FocusNfceResponse; } catch { return []; }
    return mapFocusWebhook(body);
  }
}
