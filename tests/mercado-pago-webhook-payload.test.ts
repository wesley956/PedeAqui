import { describe, expect, it } from "vitest";
import { parseMercadoPagoWebhookMetadata } from "@/server/payments/providers/mercado-pago-webhook-payload";

describe("Mercado Pago webhook payload metadata", () => {
  it("reads the documented order notification shape", () => {
    const metadata = parseMercadoPagoWebhookMetadata(JSON.stringify({
      action: "order.processed",
      api_version: "v1",
      id: "123456",
      live_mode: true,
      type: "order",
      data: { id: "ORD01K3XD6J531148171297CEDHZK" },
    }));

    expect(metadata).toEqual({
      eventId: "123456",
      type: "order",
      action: "order.processed",
      dataId: "ORD01K3XD6J531148171297CEDHZK",
    });
  });

  it("keeps partial provider payloads usable as optional metadata", () => {
    expect(parseMercadoPagoWebhookMetadata(JSON.stringify({
      type: "order",
      data: {},
    }))).toEqual({
      eventId: null,
      type: "order",
      action: null,
      dataId: null,
    });
  });

  it("does not reject reconciliation because the metadata body is malformed", () => {
    expect(parseMercadoPagoWebhookMetadata("not-json")).toEqual({
      eventId: null,
      type: null,
      action: null,
      dataId: null,
    });
  });

  it("normalizes numeric notification and resource ids", () => {
    expect(parseMercadoPagoWebhookMetadata(JSON.stringify({
      id: 123,
      data: { id: 456 },
    }))).toMatchObject({ eventId: "123", dataId: "456" });
  });
});
