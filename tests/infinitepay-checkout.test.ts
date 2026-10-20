import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { InfinitePayCheckoutProvider, InfinitePayHttpError, infinitePayNotificationSchema, safeInfinitePayCheckoutUrl } from "@/server/payments/providers/infinitepay-checkout-provider";
import { PaymentMethodFields } from "@/features/checkout/payment-method-fields";
import { buildWhatsAppPaymentPrompt, resolveWhatsAppPaymentSelection } from "@/server/conversations/whatsapp-payment-methods";

vi.mock("server-only", () => ({}));
afterEach(() => vi.restoreAllMocks());
const notification = { order_nsu: "pa_payment_abc_1", transaction_nsu: "transaction-123", invoice_slug: "invoice-456" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const input = { reference: "pa_payment_abc_1", amountCents: 3790, email: "cliente@example.com", name: "Maria", webhookUrl: "https://example.com/webhook?token=secret", redirectUrl: "https://example.com/retorno", expiresAt: "2027-01-01T20:00:00Z" };

describe("InfinitePay hosted checkout", () => {
  it("creates an exact total including delivery/discounts, one payment, 30-minute validity, and server callbacks", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ url: "https://checkout.infinitepay.com.br/invoice" }));
    expect(await new InfinitePayCheckoutProvider("inchk_secret", "dona-maria", fetcher).createCheckout(input)).toBe("https://checkout.infinitepay.com.br/invoice");
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe("https://api.checkout.infinitepay.io/links");
    expect(init).toMatchObject({ method: "POST", redirect: "error", cache: "no-store", headers: { "X-Api-Key": "inchk_secret" } });
    const body = JSON.parse(String(init!.body));
    expect(body).toMatchObject({ order_nsu: input.reference, items: [{ quantity: 1, price: 3790 }], customer: { email: input.email, name: "Maria" }, webhook: { url: input.webhookUrl, events: ["paid"] }, redirect_url: input.redirectUrl, options: { single_payment: true, valid_until: input.expiresAt, require_delivery_address: false, payment_methods_enabled: ["pix", "credit_card"] } });
    expect(JSON.stringify(body)).not.toContain("inchk_secret");
  });

  it.each([0, -1, 12.5, Number.MAX_SAFE_INTEGER + 1, NaN])("rejects invalid cents before calling the provider: %s", async (amountCents) => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(new InfinitePayCheckoutProvider("secret", "tag", fetcher).createCheckout({ ...input, amountCents })).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(["javascript:alert(1)", "http://checkout.infinitepay.com.br/link", "https://checkout.infinitepay.com.br.evil.com/link", "https://evil.com/link", "https://secret@checkout.infinitepay.com.br/link", "https://checkout.infinitepay.com.br:444/link"])("rejects untrusted redirects: %s", (url) => {
    expect(() => safeInfinitePayCheckoutUrl(url)).toThrow();
  });

  it.each(["pix", "credit_card"])("uses payment_check as the authority for %s", async (capture_method) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ success: true, paid: true, amount: 3790, paid_amount: 4000, capture_method }));
    expect(await new InfinitePayCheckoutProvider("key", "dona-maria", fetcher).checkPayment(notification)).toMatchObject({ paid: true, amount: 3790, capture_method });
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://api.checkout.infinitepay.io/payment_check");
    expect(JSON.parse(String(fetcher.mock.calls[0]?.[1]?.body))).toEqual({ handle: "dona-maria", order_nsu: notification.order_nsu, transaction_nsu: notification.transaction_nsu, slug: notification.invoice_slug });
  });

  it.each([{ success: true, paid: "true", amount: 3790, capture_method: "pix" }, { success: false, paid: true, amount: 3790, capture_method: "pix" }, { success: true, paid: true, amount: 37.9, capture_method: "pix" }, { success: true, paid: true, amount: 3790, capture_method: "debit_card" }])("fails closed on malformed provider status", async (response) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json(response));
    await expect(new InfinitePayCheckoutProvider("key", "tag", fetcher).checkPayment(notification)).rejects.toThrow();
  });

  it("reports errors without returning credential/customer-containing response bodies", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ secret: "inchk_private", email: "customer@private.com" }, 401));
    const error = await new InfinitePayCheckoutProvider("key", "tag", fetcher).checkPayment(notification).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InfinitePayHttpError);
    expect(String(error)).not.toMatch(/inchk_private|customer@private/);
  });

  it("ignores claimed payment and amount in webhook data", () => {
    expect(infinitePayNotificationSchema.parse({ ...notification, paid: true, amount: 1, capture_method: "pix" })).toEqual(notification);
    expect(infinitePayNotificationSchema.safeParse({ ...notification, invoice_slug: "../../admin" }).success).toBe(false);
  });

  it("labels online checkout distinctly from the delivery card options on mobile", () => {
    const markup = renderToStaticMarkup(createElement(PaymentMethodFields, { defaultValue: "pix", methods: [
      { value: "pix", method: "pix", label: "Pix ou cartão online", help: "Pague na InfinitePay", hostedCheckout: true },
      { value: "credit_card", method: "credit_card", label: "Cartão de crédito", help: "Na maquininha" },
    ] }));
    expect(markup).toContain("Pagar agora, pelo celular");
    expect(markup).toContain("Pagar na entrega");
    expect(markup).toContain("Pix ou cartão online");
    expect(markup).toContain("E-mail para o comprovante</span>");
  });

  it("preserves the same online label and Pix aliases in WhatsApp", () => {
    const methods = [{ method: "pix" as const, enabled: true, sortOrder: 10, label: "Pix ou cartão online" }];
    expect(buildWhatsAppPaymentPrompt(methods)).toContain("Pix ou cartão online");
    expect(resolveWhatsAppPaymentSelection("pix", methods)).toMatchObject({ method: "pix", label: "Pix ou cartão online" });
  });
});
