import { IfoodHttpError } from "@/server/integrations/providers/ifood/ifood-auth-http-client";

const DEFAULT_BASE_URL = "https://merchant-api.ifood.com.br";
const MAX_POLL_EVENTS = 100;

type FetchLike = typeof fetch;

async function providerFailure(response: Response): Promise<IfoodHttpError> {
  let message = `iFood Order API HTTP ${response.status}`;
  let code: string | null = null;
  try {
    const body = await response.json() as { error?: { code?: unknown; message?: unknown }; message?: unknown };
    if (typeof body?.error?.code === "string") code = body.error.code;
    if (typeof body?.error?.message === "string") message = body.error.message;
    else if (typeof body?.message === "string") message = body.message;
  } catch {
    // Keep the sanitized HTTP-only fallback; never include provider response bodies in logs/errors.
  }
  return new IfoodHttpError(message, response.status, response.status === 429 || response.status >= 500, code);
}

function pollingRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === "object" && Array.isArray((payload as { events?: unknown }).events)) {
    return (payload as { events: unknown[] }).events;
  }
  throw new IfoodHttpError("iFood polling response has an invalid shape", 200, false, "invalid_polling_payload");
}

export interface IfoodOrdersHttpPort {
  pollEvents(input: { accessToken: string; merchantId: string; limit?: number }): Promise<unknown[]>;
  acknowledgeEvents(input: { accessToken: string; eventIds: readonly string[] }): Promise<void>;
  getOrder(input: { accessToken: string; orderId: string }): Promise<unknown>;
}

/**
 * Thin iFood Order API transport. Authentication/token refresh is intentionally
 * injected by the caller so this class never reads Vault/DB and remains easy to
 * exercise with a fake fetch implementation.
 */
export class IfoodOrdersHttpClient implements IfoodOrdersHttpPort {
  constructor(
    private readonly fetchImpl: FetchLike = fetch,
    private readonly baseUrl = DEFAULT_BASE_URL,
  ) {}

  async pollEvents(input: { accessToken: string; merchantId: string; limit?: number }): Promise<unknown[]> {
    const requestedLimit = input.limit ?? MAX_POLL_EVENTS;
    if (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > MAX_POLL_EVENTS) {
      throw new RangeError(`iFood polling limit must be between 1 and ${MAX_POLL_EVENTS}`);
    }
    if (!input.merchantId.trim()) throw new Error("iFood merchant id is required for polling");

    const response = await this.fetchImpl(
      `${this.baseUrl}/order/v1.0/orders:polling?limit=${requestedLimit}`,
      {
        method: "GET",
        headers: {
          accept: "application/json",
          Authorization: `Bearer ${input.accessToken}`,
          "x-polling-merchants": input.merchantId,
        },
        signal: AbortSignal.timeout(12_000),
      },
    );
    if (response.status === 204) return [];
    if (!response.ok) throw await providerFailure(response);
    return pollingRows(await response.json());
  }

  async acknowledgeEvents(input: { accessToken: string; eventIds: readonly string[] }): Promise<void> {
    const eventIds = [...new Set(input.eventIds.map((id) => id.trim()).filter(Boolean))];
    if (eventIds.length === 0) return;

    const response = await this.fetchImpl(`${this.baseUrl}/order/v1.0/orders:acknowledgment`, {
      method: "POST",
      headers: {
        accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.accessToken}`,
      },
      body: JSON.stringify({ acknowledgedEventIds: eventIds }),
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw await providerFailure(response);
  }

  async getOrder(input: { accessToken: string; orderId: string }): Promise<unknown> {
    const orderId = input.orderId.trim();
    if (!orderId) throw new Error("iFood order id is required");
    const response = await this.fetchImpl(
      `${this.baseUrl}/order/v1.0/orders/${encodeURIComponent(orderId)}`,
      {
        method: "GET",
        headers: {
          accept: "application/json",
          Authorization: `Bearer ${input.accessToken}`,
        },
        signal: AbortSignal.timeout(12_000),
      },
    );
    if (!response.ok) throw await providerFailure(response);
    return response.json();
  }
}
