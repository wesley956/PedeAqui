import { afterEach, describe, expect, it, vi } from "vitest";
import type { OrderPaymentProvider } from "@/server/payments/providers/order-payment-provider";
import { MercadoPagoOrderProvider } from "@/server/payments/providers/mercado-pago-order-provider";

vi.mock("server-only", () => ({}));

afterEach(() => {
  vi.unstubAllGlobals();
});

function providerResponse(status = "action_required", detail = "waiting_transfer") {
  return {
    id: "ORD01JTEST123",
    external_reference: "pa_payment_12345678123412341234123456789012",
    total_amount: "37.90",
    country_code: "BRA",
    status,
    status_detail: detail,
    transactions: {
      payments: [{
        id: "PAY01JTEST123",
        amount: "37.90",
        status,
        status_detail: detail,
        date_of_expiration: "2026-08-15T18:30:00.000Z",
        payment_method: {
          id: "pix",
          type: "bank_transfer",
          qr_code: "000201010212TESTPIX",
          qr_code_base64: "aW1hZ2U=",
          ticket_url: "https://example.invalid/pix",
        },
      }],
    },
  };
}

describe("online Pix provider contract [327]", () => {
  it("allows a fake provider behind the same provider boundary", async () => {
    const fake: OrderPaymentProvider = {
      key: "mercado_pago",
      async createPixCharge(input) {
        return {
          providerOrderId: "fake-order",
          providerPaymentId: "fake-payment",
          status: "pending",
          statusDetail: "waiting",
          amountCents: input.amountCents,
          currency: input.currency,
          externalReference: input.externalReference,
          qrCode: "fake-code",
          qrCodeBase64: null,
          ticketUrl: null,
          expiresAt: null,
        };
      },
      async getOrder(providerOrderId) {
        return {
          providerOrderId,
          providerPaymentId: "fake-payment",
          status: "paid",
          statusDetail: "accredited",
          amountCents: 3790,
          currency: "BRL",
          externalReference: "fake-reference",
          qrCode: null,
          qrCodeBase64: null,
          ticketUrl: null,
          expiresAt: null,
        };
      },
    };
    const charge = await fake.createPixCharge({ amountCents: 3790, currency: "BRL", externalReference: "fake-reference", idempotencyKey: "fake-key-123", payerEmail: "cliente@example.com" });
    expect(charge.status).toBe("pending");
    expect(charge.amountCents).toBe(3790);
  });

  it("sends an exact idempotent Mercado Pago Orders Pix request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(providerResponse()), { status: 201, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new MercadoPagoOrderProvider("APP_USR_test-token");

    const charge = await provider.createPixCharge({
      amountCents: 3790,
      currency: "BRL",
      externalReference: "pa_payment_12345678123412341234123456789012",
      idempotencyKey: "8ddbac70-f9cb-4d87-b0ce-80296f189782",
      payerEmail: "cliente@example.com",
    });

    expect(charge).toMatchObject({ status: "pending", amountCents: 3790, qrCode: "000201010212TESTPIX" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.mercadopago.com/v1/orders");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      authorization: "Bearer APP_USR_test-token",
      "x-idempotency-key": "8ddbac70-f9cb-4d87-b0ce-80296f189782",
    });
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      type: "online",
      total_amount: "37.90",
      external_reference: "pa_payment_12345678123412341234123456789012",
      processing_mode: "automatic",
      payer: { email: "cliente@example.com" },
      transactions: { payments: [{ amount: "37.90", payment_method: { id: "pix", type: "bank_transfer" } }] },
    });
    expect(body.description).toBeUndefined();
  });

  it("maps provider settlement to paid only after accredited reconciliation", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(providerResponse("processed", "accredited")), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const provider = new MercadoPagoOrderProvider("APP_USR_test-token");
    const result = await provider.getOrder("ORD01JTEST123");
    expect(result.status).toBe("paid");
    expect(result.amountCents).toBe(3790);
    expect(result.externalReference).toBe("pa_payment_12345678123412341234123456789012");
  });
});
