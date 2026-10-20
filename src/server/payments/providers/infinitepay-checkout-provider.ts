import "server-only";

import { z } from "zod";

const API_URL = "https://api.checkout.infinitepay.io";
const identifier = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/);

export const infinitePayNotificationSchema = z.object({
  order_nsu: identifier,
  transaction_nsu: identifier,
  invoice_slug: identifier,
});
export type InfinitePayNotification = z.infer<typeof infinitePayNotificationSchema>;

export class InfinitePayHttpError extends Error {
  constructor(readonly status: number) {
    // Provider response bodies can contain customer data or credentials.
    super(`InfinitePay request failed (${status})`);
    this.name = "InfinitePayHttpError";
  }
}

export function safeInfinitePayCheckoutUrl(value: unknown): string {
  const url = new URL(z.string().parse(value));
  if (url.protocol !== "https:" || url.username || url.password || url.port
    || !["checkout.infinitepay.com.br", "checkout.infinitepay.io", "invoice.infinitepay.io"].includes(url.hostname)) {
    throw new Error("Invalid InfinitePay checkout URL");
  }
  return url.href;
}

export class InfinitePayCheckoutProvider {
  constructor(
    private readonly apiKey: string,
    private readonly handle: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private async post(path: "/links" | "/payment_check", body: unknown) {
    const response = await this.fetcher(`${API_URL}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "X-Api-Key": this.apiKey },
      body: JSON.stringify(body),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new InfinitePayHttpError(response.status);
    return response.json() as Promise<unknown>;
  }

  async createCheckout(input: {
    reference: string;
    amountCents: number;
    email: string;
    name?: string | null;
    webhookUrl: string;
    redirectUrl: string;
    expiresAt: string;
  }) {
    const amount = z.number().int().positive().max(Number.MAX_SAFE_INTEGER).parse(input.amountCents);
    const response = z.object({ url: z.string() }).parse(await this.post("/links", {
      order_nsu: identifier.parse(input.reference),
      items: [{ quantity: 1, price: amount, description: "Pedido PedeAqui (inclui entrega e descontos)" }],
      customer: { email: z.email().parse(input.email), ...(input.name ? { name: input.name } : {}) },
      redirect_url: input.redirectUrl,
      webhook: { url: input.webhookUrl, events: ["paid"] },
      options: {
        single_payment: true,
        valid_until: input.expiresAt,
        require_delivery_address: false,
        payment_methods_enabled: ["pix", "credit_card"],
      },
    }));
    return safeInfinitePayCheckoutUrl(response.url);
  }

  async checkPayment(notification: InfinitePayNotification) {
    // Never accept the webhook/return URL's paid, amount or capture_method values.
    const result = z.object({
      success: z.literal(true),
      paid: z.boolean(),
      amount: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
      paid_amount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
      capture_method: z.enum(["pix", "credit_card"]),
    }).parse(await this.post("/payment_check", {
      handle: this.handle,
      order_nsu: notification.order_nsu,
      transaction_nsu: notification.transaction_nsu,
      slug: notification.invoice_slug,
    }));
    return result;
  }
}
