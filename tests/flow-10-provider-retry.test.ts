import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WhatsAppCloudProvider } from "@/server/conversations/provider";
import { notificationClientMessageId } from "@/server/conversations/order-notification-model";

describe("[FLOW-10 D03] WhatsApp provider retry", () => {
  beforeEach(() => {
    vi.stubEnv("WHATSAPP_GRAPH_API_VERSION", "v23.0");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("retries a timeout with the same logical message and records one accepted delivery", async () => {
    let acceptedDeliveries = 0;
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new DOMException("Timed out", "TimeoutError"))
      .mockImplementationOnce(async () => {
        acceptedDeliveries += 1;
        return new Response(JSON.stringify({ messages: [{ id: "wamid.flow10.retry.success" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      });
    vi.stubGlobal("fetch", fetchMock);

    const provider = new WhatsAppCloudProvider("offline-controlled-token");
    const send = () => provider.sendText({
      phoneNumberId: "123456789",
      recipient: "5511999999999",
      body: "Pedido #42 saiu para entrega.",
    });
    const identity = {
      organizationId: "11111111-1111-4111-8111-111111111111",
      storeId: "22222222-2222-4222-8222-222222222222",
      orderId: "33333333-3333-4333-8333-333333333333",
      type: "out_for_delivery" as const,
      authoritativeEventId: "44444444-4444-4444-8444-444444444444",
    };

    await expect(send()).rejects.toMatchObject({
      name: "WhatsAppProviderError",
      status: 408,
      providerCode: "network_timeout",
      retryable: true,
    });
    const firstClientMessageId = notificationClientMessageId(identity);

    await expect(send()).resolves.toEqual({ externalMessageId: "wamid.flow10.retry.success" });
    const retriedClientMessageId = notificationClientMessageId(identity);

    expect(retriedClientMessageId).toBe(firstClientMessageId);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[1]?.body).toBe(fetchMock.mock.calls[0]?.[1]?.body);
    expect(acceptedDeliveries).toBe(1);
  });
});
