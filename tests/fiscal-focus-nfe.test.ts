import { describe, expect, it } from "vitest";
import type { FiscalDocumentEnvelope, FiscalProviderContext } from "@/server/fiscal/fiscal-provider";
import {
  FocusNfeProvider,
  apportion,
  buildFocusNfcePayload,
  cancellationReason,
  isoWithOffset,
  mapFocusWebhook,
} from "@/server/fiscal/providers/focus-nfe";
import { resolveFiscalProvider } from "@/server/fiscal/fiscal-provider-registry";

const fiscal = { missing_profile: false, ncm: "21069090", cfop: "5102", cst_csosn: "102", tax_data: {} };

function envelope(overrides: Partial<Record<string, unknown>> = {}, items?: Array<Record<string, unknown>>): FiscalDocumentEnvelope {
  return {
    document: {
      id: "11111111-2222-4333-8444-555555555555",
      model: "65",
      provider_document_id: null,
      issuer_snapshot: { tax_id: "12.345.678/0001-23" },
      customer_snapshot: { name: "Cliente" },
      totals_snapshot: { subtotal_cents: 3000, discount_cents: 300, delivery_fee_cents: 500, total_cents: 3200 },
      fiscal_payload: { fulfillment_type: "delivery" },
      payments: [{ method: "pix", amount_cents: 3200 }],
      ...overrides,
    },
    items: items ?? [
      { product_id: "p1", description: "Açaí 500 ml", quantity: 1, unit_price_cents: 2000, total_cents: 2000, fiscal_snapshot: fiscal },
      { product_id: "p2", description: "Água", quantity: 2, unit_price_cents: 500, total_cents: 1000, fiscal_snapshot: fiscal },
    ],
  };
}

const context: FiscalProviderContext = { providerKey: "focus_nfe", environment: "homologation", secret: "token-teste", config: {} };

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("Focus NFe: montagem da NFC-e", () => {
  it("monta os campos exigidos e reparte desconto e entrega entre os itens sem perder centavos", () => {
    const payload = buildFocusNfcePayload(envelope(), { now: new Date("2026-10-13T15:00:00Z"), utcOffsetMinutes: -180 });
    expect(payload.cnpj_emitente).toBe("12345678000123");
    expect(payload.data_emissao).toBe("2026-10-13T12:00:00-03:00");
    expect(payload.presenca_comprador).toBe(4);
    expect(payload.modalidade_frete).toBe(9);
    expect(payload.items).toHaveLength(2);
    const discount = payload.items.reduce((sum, item) => sum + (item.valor_desconto ?? 0), 0);
    const delivery = payload.items.reduce((sum, item) => sum + (item.valor_outras_despesas ?? 0), 0);
    expect(Math.round(discount * 100)).toBe(300);
    expect(Math.round(delivery * 100)).toBe(500);
    expect(payload.formas_pagamento).toEqual([{ forma_pagamento: "17", valor_pagamento: 32 }]);
  });

  it("recusa antes de chamar a SEFAZ quando falta cadastro fiscal do produto", async () => {
    let calls = 0;
    const provider = new FocusNfeProvider(async () => { calls += 1; return jsonResponse(200, {}); });
    const result = await provider.issue(envelope({}, [{ description: "X-Burguer", quantity: 1, unit_price_cents: 100, total_cents: 100, fiscal_snapshot: { missing_profile: true } }]), context);
    expect(result.status).toBe("rejected");
    if (result.status === "rejected") expect(result.message).toContain("X-Burguer");
    expect(calls).toBe(0);
  });

  it("reparte valores proporcionalmente", () => {
    expect(apportion(100, [1, 1, 1])).toEqual([33, 33, 34]);
    expect(apportion(0, [5, 5])).toEqual([0, 0]);
    expect(isoWithOffset(new Date("2026-01-01T03:00:00Z"), -180)).toBe("2026-01-01T00:00:00-03:00");
    expect(cancellationReason("erro").length).toBeGreaterThanOrEqual(15);
  });
});

describe("Focus NFe: emissão e cancelamento", () => {
  it("emite, busca o protocolo na consulta completa e baixa o XML", async () => {
    const urls: string[] = [];
    let queries = 0;
    const provider = new FocusNfeProvider(async (input, init) => {
      urls.push(`${init?.method ?? "GET"} ${input}`);
      expect(String((init?.headers as Record<string, string>)?.authorization)).toBe(`Basic ${Buffer.from("token-teste:").toString("base64")}`);
      if (input.includes("/v2/nfce/") && (init?.method ?? "GET") === "GET") {
        queries += 1;
        return queries === 1 ? jsonResponse(404, { codigo: "nao_encontrado" }) : jsonResponse(200, { status: "autorizado", protocolo_nota_fiscal: { numero_protocolo: "141260000000001" } });
      }
      if (input.includes("/v2/nfce?ref=")) return jsonResponse(201, { status: "autorizado", status_sefaz: "100", mensagem_sefaz: "Autorizado", chave_nfe: "NFe41190612345678000123650010000000121743484310", numero: "12", serie: "1", caminho_xml_nota_fiscal: "/arquivos/nota.xml" });
      return new Response("<xml/>", { status: 200 });
    });
    const result = await provider.issue(envelope(), context);
    expect(result).toMatchObject({ status: "authorized", accessKey: "41190612345678000123650010000000121743484310", protocol: "141260000000001", providerDocumentId: "pedeaqui-11111111-2222-4333-8444-555555555555" });
    if (result.status === "authorized") expect(result.artifacts?.xml).toBe("<xml/>");
    expect(urls[0]).toContain("https://homologacao.focusnfe.com.br/v2/nfce/pedeaqui-");
  });

  it("não emite de novo se a referência já foi autorizada", async () => {
    const methods: string[] = [];
    const provider = new FocusNfeProvider(async (input, init) => {
      methods.push(init?.method ?? "GET");
      if (input.includes("/v2/nfce/")) return jsonResponse(200, { status: "autorizado", status_sefaz: "100", chave_nfe: "NFe999", protocolo: "123" });
      return new Response("", { status: 404 });
    });
    const result = await provider.issue(envelope(), context);
    expect(methods).not.toContain("POST");
    expect(result).toMatchObject({ status: "authorized", accessKey: "999", protocol: "123" });
  });

  it("reenvia uma nota rejeitada com a mesma referência e mostra o motivo da SEFAZ", async () => {
    const methods: string[] = [];
    const provider = new FocusNfeProvider(async (input, init) => {
      methods.push(init?.method ?? "GET");
      if (init?.method === "POST") return jsonResponse(201, { status: "erro_autorizacao", status_sefaz: "704", mensagem_sefaz: "Rejeição: Data-Hora de emissão atrasada" });
      return jsonResponse(200, { status: "erro_autorizacao", status_sefaz: "539", mensagem_sefaz: "Duplicidade" });
    });
    const result = await provider.issue(envelope(), context);
    expect(methods).toContain("POST");
    expect(result).toMatchObject({ status: "rejected", code: "704" });
  });

  it("trata 401 como erro de conta para o worker tentar de novo", async () => {
    const provider = new FocusNfeProvider(async () => jsonResponse(401, { mensagem: "Token inválido" }));
    await expect(provider.issue(envelope(), context)).rejects.toThrow("recusou o acesso");
  });

  it("cancela com justificativa válida", async () => {
    let sentBody = "";
    const provider = new FocusNfeProvider(async (_input, init) => {
      if (init?.method === "DELETE") { sentBody = String(init.body); return jsonResponse(200, { status: "cancelado", status_sefaz: "135", mensagem_sefaz: "Evento registrado" }); }
      return new Response("", { status: 404 });
    });
    const result = await provider.cancel({ ...envelope({ provider_document_id: "pedeaqui-x" }), reason: "Erro" }, context);
    expect(result.status).toBe("cancelled");
    expect(JSON.parse(sentBody).justificativa.length).toBeGreaterThanOrEqual(15);
  });
});

describe("Focus NFe: webhook", () => {
  it("só aceita o cabeçalho configurado com o secret", () => {
    const provider = new FocusNfeProvider();
    const webhookContext = { ...context, secret: "segredo-do-webhook", config: { webhookHeader: "x-pedeaqui-token" } };
    expect(provider.verifyWebhook("{}", new Headers({ "x-pedeaqui-token": "segredo-do-webhook" }), webhookContext)).toBe(true);
    expect(provider.verifyWebhook("{}", new Headers({ "x-pedeaqui-token": "outro" }), webhookContext)).toBe(false);
    expect(provider.verifyWebhook("{}", new Headers(), webhookContext)).toBe(false);
  });

  it("traduz os estados da Focus para o PedeAqui", () => {
    expect(mapFocusWebhook({ ref: "r1", status: "autorizado", status_sefaz: "100", chave_nfe: "NFe123" })[0]).toMatchObject({ status: "authorized", accessKey: "123", providerDocumentId: "r1" });
    expect(mapFocusWebhook({ ref: "r1", status: "cancelado", status_sefaz: "135" })[0]?.status).toBe("cancelled");
    expect(mapFocusWebhook({ ref: "r1", status: "erro_autorizacao", status_sefaz: "704" })[0]?.status).toBe("rejected");
    expect(mapFocusWebhook({ status: "autorizado" })).toEqual([]);
  });

  it("fica registrado no catálogo de emissores", () => {
    expect(resolveFiscalProvider("focus_nfe")?.key).toBe("focus_nfe");
  });
});
