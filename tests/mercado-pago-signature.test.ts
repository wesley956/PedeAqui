import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { validateMercadoPagoWebhookSignature } from "../src/server/payments/providers/mercado-pago-signature";

function signatureFor(input: {
  dataId: string;
  requestId: string;
  ts: string;
  secret: string;
}) {
  const manifest = `id:${input.dataId};request-id:${input.requestId};ts:${input.ts};`;
  const v1 = createHmac("sha256", input.secret).update(manifest).digest("hex");
  return `ts=${input.ts},v1=${v1}`;
}

describe("Mercado Pago webhook signature", () => {
  it("lowercases alphanumeric Order API ids before validating the manifest", () => {
    const secret = "production-webhook-secret";
    const dataId = "ORD01M17TCBPHV6507XHX2YYT378M";
    const requestId = "2066ca19-c6f1-498a-be75-1923005edd06";
    const ts = "1788031958";
    const xSignature = signatureFor({
      dataId: dataId.toLowerCase(),
      requestId,
      ts,
      secret,
    });

    expect(validateMercadoPagoWebhookSignature({
      xSignature,
      xRequestId: requestId,
      dataId,
      secret,
    })).toBe(true);
  });

  it("does not accept a signature built from the uppercase Order API id", () => {
    const secret = "production-webhook-secret";
    const dataId = "ORD01M17TCBPHV6507XHX2YYT378M";
    const requestId = "2066ca19-c6f1-498a-be75-1923005edd06";
    const ts = "1788031958";
    const xSignature = signatureFor({ dataId, requestId, ts, secret });

    expect(validateMercadoPagoWebhookSignature({
      xSignature,
      xRequestId: requestId,
      dataId,
      secret,
    })).toBe(false);
  });
});
