import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { validateMercadoPagoWebhookSignature } from "@/server/payments/providers/mercado-pago-signature";

function signature(secret: string, dataId: string, requestId: string, ts: string) {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const digest = createHmac("sha256", secret).update(manifest).digest("hex");
  return `ts=${ts},v1=${digest}`;
}

describe("Mercado Pago webhook signature [328]", () => {
  it("accepts the documented HMAC manifest", () => {
    const secret = "webhook-test-secret";
    const dataId = "ORD01JTEST123";
    const requestId = "request-abc";
    const ts = "1786812345";
    expect(validateMercadoPagoWebhookSignature({
      xSignature: signature(secret, dataId, requestId, ts),
      xRequestId: requestId,
      dataId,
      secret,
    })).toBe(true);
  });

  it("rejects tampered data, request id and digest", () => {
    const secret = "webhook-test-secret";
    const dataId = "ORD01JTEST123";
    const requestId = "request-abc";
    const ts = "1786812345";
    const xSignature = signature(secret, dataId, requestId, ts);

    expect(validateMercadoPagoWebhookSignature({ xSignature, xRequestId: requestId, dataId: "other", secret })).toBe(false);
    expect(validateMercadoPagoWebhookSignature({ xSignature, xRequestId: "other", dataId, secret })).toBe(false);
    expect(validateMercadoPagoWebhookSignature({ xSignature: `ts=${ts},v1=${"0".repeat(64)}`, xRequestId: requestId, dataId, secret })).toBe(false);
    expect(validateMercadoPagoWebhookSignature({ xSignature: "invalid", xRequestId: requestId, dataId, secret })).toBe(false);
  });
});
