import { describe, expect, it, vi } from "vitest";
import { IfoodOrdersHttpClient } from "@/server/integrations/providers/ifood/ifood-orders-http-client";

type CapturedCall = { url: string; init: RequestInit | undefined };

function fakeFetch(handler: (call: CapturedCall) => Response | Promise<Response>) {
  const calls: CapturedCall[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(input), init };
    calls.push(call);
    return handler(call);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("iFood order lifecycle HTTP client", () => {
  it("uses the official asynchronous lifecycle endpoints without treating 202 as a local confirmation", async () => {
    const { fetchImpl, calls } = fakeFetch(() => new Response(null, { status: 202 }));
    const client = new IfoodOrdersHttpClient(fetchImpl, "https://merchant.test");

    await client.confirmOrder({ accessToken: "token-1", orderId: "order/123" });
    await client.startPreparation({ accessToken: "token-1", orderId: "order/123" });
    await client.readyToPickup({ accessToken: "token-1", orderId: "order/123" });

    expect(calls.map((call) => call.url)).toEqual([
      "https://merchant.test/order/v1.0/orders/order%2F123/confirm",
      "https://merchant.test/order/v1.0/orders/order%2F123/startPreparation",
      "https://merchant.test/order/v1.0/orders/order%2F123/readyToPickup",
    ]);
    for (const call of calls) {
      expect(call.init?.method).toBe("POST");
      expect(new Headers(call.init?.headers).get("authorization")).toBe("Bearer token-1");
      expect(call.init?.body).toBeUndefined();
    }
  });

  it("loads provider cancellation reasons before sending the selected reason code", async () => {
    const { fetchImpl, calls } = fakeFetch((call) => {
      if (call.url.endsWith("/cancellationReasons")) {
        return Response.json({
          reasons: [
            { code: "OUT_OF_STOCK", description: "Item indisponível" },
            { code: "STORE_CLOSED", description: "Loja fechada" },
          ],
        });
      }
      return new Response(null, { status: 202 });
    });
    const client = new IfoodOrdersHttpClient(fetchImpl, "https://merchant.test");

    const reasons = await client.getCancellationReasons({ accessToken: "token-2", orderId: "abc" });
    expect(reasons).toEqual([
      { code: "OUT_OF_STOCK", description: "Item indisponível" },
      { code: "STORE_CLOSED", description: "Loja fechada" },
    ]);

    await client.requestCancellation({
      accessToken: "token-2",
      orderId: "abc",
      reason: reasons[0].code,
    });

    expect(calls[0].url).toBe("https://merchant.test/order/v1.0/orders/abc/cancellationReasons");
    expect(calls[0].init?.method).toBe("GET");
    expect(calls[1].url).toBe("https://merchant.test/order/v1.0/orders/abc/requestCancellation");
    expect(calls[1].init?.method).toBe("POST");
    expect(JSON.parse(String(calls[1].init?.body))).toEqual({ reason: "OUT_OF_STOCK" });
  });

  it("rejects malformed cancellation-reason payloads instead of accepting an unsafe free-text fallback", async () => {
    const { fetchImpl } = fakeFetch(() => Response.json({ reasons: [{ code: "MISSING_DESCRIPTION" }] }));
    const client = new IfoodOrdersHttpClient(fetchImpl, "https://merchant.test");

    await expect(client.getCancellationReasons({ accessToken: "token", orderId: "abc" }))
      .rejects.toMatchObject({ code: "invalid_cancellation_reason_payload", retryable: false });
  });
});
