import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("Mercado Pago webhook reconciliation contract", () => {
  it("uses the signed URL resource id as the canonical order id", () => {
    const service = read("src/server/payments/mercado-pago-webhook-service.ts");

    expect(service).toContain("const dataId = input.dataId?.trim()");
    expect(service).toContain("dataId,");
    expect(service).toContain("provider_order_id: dataId");
    expect(service).toContain("OrderPixService.reconcile(credentials.store_id, dataId)");
    expect(service).not.toContain("input.dataId !== body.data.id");
    expect(service).not.toContain("webhookSchema.parse");
  });

  it("keeps body fields optional after signature verification", () => {
    const service = read("src/server/payments/mercado-pago-webhook-service.ts");

    expect(service).toContain("parseMercadoPagoWebhookMetadata(input.rawBody)");
    expect(service).toContain("`request:${xRequestId}`");
    expect(service).toContain('"order.notification"');
  });
});
