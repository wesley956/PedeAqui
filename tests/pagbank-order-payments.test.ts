import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  PagBankOrderProvider,
  PagBankProviderHttpError,
  isValidCpf,
  mapPagBankOrder,
  pagBankDate,
  parsePagBankNotificationOrderId,
} from "@/server/payments/providers/pagbank-order-provider";
import {
  buildPagBankAuthorizationUrl,
  createPagBankOAuthSession,
  readPagBankOAuthSession,
  refreshPagBankToken,
} from "@/server/payments/providers/pagbank-connect";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

afterEach(() => {
  vi.unstubAllEnvs();
});

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function pagBankOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: "ORDE_1234ABCD",
    reference_id: "pa_payment_abc_1",
    qr_codes: [{
      id: "QRCO_1",
      expiration_date: "2099-10-13T20:15:59-03:00",
      amount: { value: 3790 },
      text: "00020101021226830014br.gov.bcb.pix",
      arrangements: ["PIX"],
      links: [
        { rel: "QRCODE.PNG", href: "https://sandbox.api.pagseguro.com/qrcode/QRCO_1/png", media: "image/png", type: "GET" },
        { rel: "QRCODE.BASE64", href: "https://sandbox.api.pagseguro.com/qrcode/QRCO_1/base64", media: "text/plain", type: "GET" },
      ],
    }],
    ...overrides,
  };
}

const validCpf = "52998224725";

describe("PagBank: regras locais", () => {
  it("valida CPF pelos dígitos verificadores", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true);
    expect(isValidCpf("52998224726")).toBe(false);
    expect(isValidCpf("11111111111")).toBe(false);
    expect(isValidCpf("123")).toBe(false);
    expect(isValidCpf(null)).toBe(false);
  });

  it("formata a validade no horário de Brasília", () => {
    expect(pagBankDate(new Date("2026-10-13T23:15:59.000Z"))).toBe("2026-10-13T20:15:59-03:00");
  });

  it("lê só um id de pedido válido da notificação", () => {
    expect(parsePagBankNotificationOrderId(JSON.stringify({ id: "ORDE_ABC-123", charges: [] }))).toBe("ORDE_ABC-123");
    expect(parsePagBankNotificationOrderId(JSON.stringify({ id: "../../x" }))).toBeNull();
    expect(parsePagBankNotificationOrderId("not json")).toBeNull();
  });
});

describe("PagBank: estados do pedido", () => {
  it("fica pendente enquanto o QR Code vale e não há cobrança", () => {
    const order = mapPagBankOrder(pagBankOrder());
    expect(order).toMatchObject({
      providerOrderId: "ORDE_1234ABCD",
      status: "pending",
      amountCents: 3790,
      externalReference: "pa_payment_abc_1",
      qrCode: "00020101021226830014br.gov.bcb.pix",
      ticketUrl: "https://sandbox.api.pagseguro.com/qrcode/QRCO_1/png",
      providerPaymentId: null,
    });
  });

  it("fica pago quando o PagBank adiciona uma cobrança PAID", () => {
    const order = mapPagBankOrder(pagBankOrder({ charges: [{ id: "CHAR_1", status: "PAID", amount: { value: 3790, currency: "BRL" } }] }));
    expect(order).toMatchObject({ status: "paid", providerPaymentId: "CHAR_1", amountCents: 3790 });
  });

  it("expira quando o QR Code venceu sem pagamento", () => {
    const order = mapPagBankOrder(pagBankOrder(), new Date("2100-01-01T00:00:00Z"));
    expect(order.status).toBe("expired");
  });

  it("recusa pedido sem QR Code", () => {
    expect(() => mapPagBankOrder({ id: "ORDE_X", qr_codes: [] })).toThrow("no Pix QR Code");
  });
});

describe("PagBank: criação e consulta", () => {
  it("cria o pedido com CPF, chave de idempotência e URL de notificação, e busca a imagem do QR", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      if (url.endsWith("/orders")) return jsonResponse(201, pagBankOrder());
      return new Response("aW1hZ2Vt", { status: 200 });
    }) as unknown as typeof fetch;
    const provider = new PagBankOrderProvider("token-loja", "test", { notificationUrl: "https://www.pedeaqui.pp.ua/api/webhooks/payments/pagbank/loja?token=abc", fetcher });

    const result = await provider.createPixCharge({
      amountCents: 3790,
      currency: "BRL",
      externalReference: "pa_payment_abc_1",
      idempotencyKey: "chave-1",
      payerEmail: "cliente@example.com",
      payerName: "Maria",
      payerTaxId: "529.982.247-25",
    });

    expect(result).toMatchObject({ status: "pending", qrCodeBase64: "aW1hZ2Vt", providerOrderId: "ORDE_1234ABCD" });
    const create = calls[0];
    expect(create?.url).toBe("https://sandbox.api.pagseguro.com/orders");
    expect(create?.init?.headers).toMatchObject({ authorization: "Bearer token-loja", "x-idempotency-key": "chave-1" });
    const body = JSON.parse(String(create?.init?.body));
    expect(body).toMatchObject({
      reference_id: "pa_payment_abc_1",
      customer: { name: "Maria", email: "cliente@example.com", tax_id: validCpf },
      qr_codes: [{ amount: { value: 3790 } }],
      notification_urls: ["https://www.pedeaqui.pp.ua/api/webhooks/payments/pagbank/loja?token=abc"],
    });
    expect(body.qr_codes[0].expiration_date).toMatch(/-03:00$/);
    expect(calls[1]?.url).toBe("https://sandbox.api.pagseguro.com/qrcode/QRCO_1/base64");
    expect(calls[1]?.init?.redirect).toBe("error");
  });

  it.each([
    "https://evilpagseguro.com/qrcode",
    "http://sandbox.api.pagseguro.com/qrcode",
    "https://api.pagseguro.com/qrcode",
    "https://user:pass@sandbox.api.pagseguro.com/qrcode",
  ])("não envia credenciais ao link de imagem fora da origem autorizada: %s", async (href) => {
    const body = pagBankOrder();
    body.qr_codes[0]!.links = [{ rel: "QRCODE.BASE64", href, media: "text/plain", type: "GET" }];
    const fetcher = vi.fn(async () => jsonResponse(201, body)) as unknown as typeof fetch;
    const provider = new PagBankOrderProvider("secret", "test", { fetcher });
    const result = await provider.createPixCharge({ amountCents: 3790, currency: "BRL", externalReference: "r", idempotencyKey: "k", payerEmail: "a@b.c", payerTaxId: validCpf });
    expect(result.qrCodeBase64).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("não chama o PagBank sem CPF válido", async () => {
    const fetcher = vi.fn() as unknown as typeof fetch;
    const provider = new PagBankOrderProvider("token-loja", "production", { fetcher });
    await expect(provider.createPixCharge({ amountCents: 100, currency: "BRL", externalReference: "r", idempotencyKey: "k", payerEmail: "a@b.c", payerTaxId: "123" })).rejects.toThrow("CPF");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("expõe o campo recusado pelo PagBank", async () => {
    const fetcher = vi.fn(async () => jsonResponse(400, { error_messages: [{ code: "40002", description: "invalid_parameter", parameter_name: "customer.tax_id" }] })) as unknown as typeof fetch;
    const provider = new PagBankOrderProvider("token-loja", "production", { fetcher });
    const error = await provider.createPixCharge({ amountCents: 100, currency: "BRL", externalReference: "r", idempotencyKey: "k", payerEmail: "a@b.c", payerTaxId: validCpf }).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PagBankProviderHttpError);
    expect(error).toMatchObject({ status: 400, code: "40002", parameter: "customer.tax_id" });
  });

  it("consulta o pedido na produção pelo id", async () => {
    const fetcher = vi.fn(async () => jsonResponse(200, pagBankOrder({ charges: [{ id: "CHAR_9", status: "PAID", amount: { value: 3790 } }] }))) as unknown as typeof fetch;
    const provider = new PagBankOrderProvider("token-loja", "production", { fetcher });
    const result = await provider.getOrder("ORDE_1234ABCD");
    expect(result.status).toBe("paid");
    expect(vi.mocked(fetcher).mock.calls[0]?.[0]).toBe("https://api.pagseguro.com/orders/ORDE_1234ABCD");
  });
});

describe("PagBank Connect", () => {
  function stubConnectEnv() {
    vi.stubEnv("PAGBANK_ENVIRONMENT", "sandbox");
    vi.stubEnv("PAGBANK_CLIENT_ID", "client-test");
    vi.stubEnv("PAGBANK_CLIENT_SECRET", "secret-test");
    vi.stubEnv("PAGBANK_PLATFORM_TOKEN", "platform-test");
    vi.stubEnv("PAGBANK_OAUTH_REDIRECT_URI", "https://www.pedeaqui.pp.ua/api/integrations/pagbank/oauth/callback");
  }

  it("monta a autorização com escopos separados por +", () => {
    stubConnectEnv();
    const url = buildPagBankAuthorizationUrl({ state: "s".repeat(64) });
    expect(url.startsWith("https://connect.sandbox.pagbank.com.br/oauth2/authorize?")).toBe(true);
    expect(url).toContain("client_id=client-test");
    expect(url).toContain("&scope=payments.read+payments.create+accounts.read");
  });

  it("assina a sessão do OAuth e recusa adulteração", () => {
    stubConnectEnv();
    const created = createPagBankOAuthSession({ organizationId: "11111111-1111-4111-8111-111111111111", storeId: "22222222-2222-4222-8222-222222222222" });
    expect(readPagBankOAuthSession(created.cookieValue).storeId).toBe("22222222-2222-4222-8222-222222222222");
    const [encoded] = created.cookieValue.split(".");
    expect(() => readPagBankOAuthSession(`${encoded}.assinatura-falsa`)).toThrow();
  });

  it("renova o token com as credenciais da aplicação", async () => {
    stubConnectEnv();
    const fetcher = vi.fn(async () => jsonResponse(200, { access_token: "novo", refresh_token: "refresh-2", expires_in: "31536000", account_id: "ACCO_1" })) as unknown as typeof fetch;
    const token = await refreshPagBankToken("refresh-1", fetcher);
    expect(token).toMatchObject({ access_token: "novo", refresh_token: "refresh-2", expires_in: 31536000 });
    const [url, init] = vi.mocked(fetcher).mock.calls[0] ?? [];
    expect(url).toBe("https://sandbox.api.pagseguro.com/oauth2/refresh");
    expect((init as RequestInit).headers).toMatchObject({ authorization: "Bearer platform-test", X_CLIENT_ID: "client-test", X_CLIENT_SECRET: "secret-test" });
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ grant_type: "refresh_token", refresh_token: "refresh-1" });
  });
});

describe("PagBank: contratos do servidor", () => {
  it("guarda tokens no Vault, aceita o provedor e mantém um Pix ativo por unidade", () => {
    const sql = read("supabase/sql/227_pagbank_order_payments.sql");
    expect(sql).toBe(read("supabase/migrations/20261013080000_pagbank_order_payments.sql"));
    expect(sql).toContain("check (provider in (''mercado_pago'',''pagbank''))");
    expect(sql).toContain("order_payment_provider_configs_one_enabled_idx");
    expect(sql).toContain("vault.create_secret");
    expect(sql).toContain("pagbank credentials changed concurrently");
    expect(sql).not.toMatch(/grant execute[^;]+to (anon|authenticated)/i);
  });

  it("autentica a notificação e reconsulta o PagBank antes de dar baixa", () => {
    const webhook = read("src/server/payments/pagbank-webhook-service.ts");
    expect(webhook).toContain("timingSafeEqual");
    expect(webhook).toContain('OrderPixService.reconcile(credentials.store_id, orderId, "pagbank")');
    expect(webhook).toContain('insertError.code !== "23505"');
  });

  it("pede o CPF na página do pedido sem gravá-lo", () => {
    const pix = read("src/server/payments/order-pix-service.ts");
    const action = read("src/features/payments/public-pix-actions.ts");
    expect(pix).toContain('status: "needs_document"');
    expect(pix).not.toContain("payer_tax_id");
    expect(action).toContain("PublicOrderService.getTracking(slug, orderId, accessToken)");
    expect(action).toContain("isValidCpf(cpf)");
  });

  it("valida o retorno do OAuth na mesma unidade que iniciou", () => {
    const callback = read("src/app/api/integrations/pagbank/oauth/callback/route.ts");
    expect(callback).toContain("oauthSession.state !== state");
    expect(callback).toContain("context.storeId !== oauthSession.storeId");
    expect(callback).toContain("maxAge: 0");
  });
});
