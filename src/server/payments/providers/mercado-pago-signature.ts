import { createHmac, timingSafeEqual } from "node:crypto";

function signatureParts(value: string) {
  const parts = new Map<string, string>();
  for (const entry of value.split(",")) {
    const [key, ...rest] = entry.trim().split("=");
    if (key && rest.length) parts.set(key, rest.join("=").trim());
  }
  return { ts: parts.get("ts") ?? null, v1: parts.get("v1") ?? null };
}

export function validateMercadoPagoWebhookSignature(input: {
  xSignature: string;
  xRequestId: string;
  dataId: string;
  secret: string;
}) {
  const { ts, v1 } = signatureParts(input.xSignature);
  if (!ts || !v1 || !/^[a-f0-9]{64}$/i.test(v1)) return false;

  // Mercado Pago requires alphanumeric data.id values to be lowercased when
  // building the HMAC manifest. Order API resource ids arrive as uppercase
  // ORD... values, so using the raw query value makes every valid signature fail.
  const signedDataId = input.dataId.toLowerCase();
  const manifest = `id:${signedDataId};request-id:${input.xRequestId};ts:${ts};`;
  const expected = createHmac("sha256", input.secret).update(manifest).digest("hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  const actualBuffer = Buffer.from(v1, "hex");
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer);
}
