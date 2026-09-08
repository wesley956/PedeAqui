import { IfoodHttpError } from "@/server/integrations/providers/ifood/ifood-auth-http-client";

const DEFAULT_BASE_URL = "https://merchant-api.ifood.com.br";
const MAX_POLL_EVENTS = 100;

type FetchLike = typeof fetch;

export type IfoodOrderCancellationReason = {
  code: string;
  description: string;
};

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

async function providerFailure(response: Response): Promise<IfoodHttpError> {
  let message = `iFood Order API HTTP ${response.status}`;
  let code: string | null = null;
  try {
    const body = await response.json() as {
      code?: unknown;
      error?: { code?: unknown; message?: unknown };
      message?: unknown;
    };
    if (typeof body?.error?.code === "string") code = body.error.code;
    else if (typeof body?.code === "string") code = body.code;
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

function cancellationReasonRows(payload: unknown): IfoodOrderCancellationReason[] {
  const rows = payload && typeof payload === "object" && Array.isArray((payload as { reasons?: unknown }).reasons)
    ? (payload as { reasons: unknown[] }).reasons
    : Array.isArray(payload)
      ? payload
      : null;
  if (!rows) {
    throw new IfoodHttpError(
      "iFood cancellation reasons response has an invalid shape",
      200,
      false,
      "invalid_cancellation_reasons_payload",
    );
  }
  return rows.map((row) => {
    if (!row || typeof row !== "object") {
      throw new IfoodHttpError(
        "iFood cancellation reason has an invalid shape",
        200,
        false,
        "invalid_cancellation_reason_payload",
      );
    }
    const record = row as Record<string, unknown>;
    const code = asNonEmptyString(record.code);
    const description = asNonEmptyString(record.description);
    if (!code || !description) {
      throw new IfoodHttpError(
        "iFood cancellation reason is incomplete",
        200,
        false,
        "invalid_cancellation_reason_payload",
      );
    }
    return { code, description };
  });
}

export interface IfoodOrdersHttpPort {
  pollEvents(input: { accessToken: string; merchantId: string; limit?: number }): Promise<unknown[]>;
  acknowledgeEvents(input: { accessToken: string; eventIds: readonly string[] }): Promise<void>;
  getOrder(input: { accessToken: string; orderId: string }): Promise<unknown>;
  confirmOrder(input: { accessToken: string; orderId: string }): Promise<void>;
  startPreparation(input: { accessToken: string; orderId: string }): Promise<void>;
  readyToPickup(input: { accessToken: string; orderId: string }): Promise<void>;
  getCancellationReasons(input: { accessToken: string; orderId: string }): Promise<IfoodOrderCancellationReason[]>;
  requestCancellation(input: { accessToken: string; orderId: string; reason: string }): Promise<void>;
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

  private async postOrderAction(input: {
    accessToken: string;
    orderId: string;
    action: "confirm" | "startPreparation" | "readyToPickup" | "requestCancellation";
    body?: unknown;
  }): Promise<void> {
    const orderId = input.orderId.trim();
    if (!orderId) throw new Error("iFood order id is required");
    const response = await this.fetchImpl(
      `${this.baseUrl}/order/v1.0/orders/${encodeURIComponent(orderId)}/${input.action}`,
      {
        method: "POST",
        headers: {
          accept: "application/json",
          "Content-Type": "application/json",
          Authorization: `Bearer ${input.accessToken}`,
        },
        body: input.body === undefined ? undefined : JSON.stringify(input.body),
        signal: AbortSignal.timeout(12_000),
      },
    );
    if (!response.ok) throw await providerFailure(response);
  }

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

  confirmOrder(input: { accessToken: string; orderId: string }): Promise<void> {
    return this.postOrderAction({ ...input, action: "confirm" });
  }

  startPreparation(input: { accessToken: string; orderId: string }): Promise<void> {
    return this.postOrderAction({ ...input, action: "startPreparation" });
  }

  readyToPickup(input: { accessToken: string; orderId: string }): Promise<void> {
    return this.postOrderAction({ ...input, action: "readyToPickup" });
  }

  async getCancellationReasons(input: { accessToken: string; orderId: string }): Promise<IfoodOrderCancellationReason[]> {
    const orderId = input.orderId.trim();
    if (!orderId) throw new Error("iFood order id is required");
    const response = await this.fetchImpl(
      `${this.baseUrl}/order/v1.0/orders/${encodeURIComponent(orderId)}/cancellationReasons`,
      {
        method: "GET",
        headers: {
          accept: "application/json",
          Authorization: `Bearer ${input.accessToken}`,
        },
        signal: AbortSignal.timeout(12_000),
      },
    );
    if (response.status === 204) return [];
    if (!response.ok) throw await providerFailure(response);
    return cancellationReasonRows(await response.json());
  }

  requestCancellation(input: { accessToken: string; orderId: string; reason: string }): Promise<void> {
    const reason = input.reason.trim();
    if (!reason) throw new Error("iFood cancellation reason is required");
    return this.postOrderAction({
      accessToken: input.accessToken,
      orderId: input.orderId,
      action: "requestCancellation",
      body: { reason },
    });
  }
}
