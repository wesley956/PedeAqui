import { afterEach, expect, it, vi } from "vitest";
import { OrderPixService } from "@/server/payments/order-pix-service";
import { priceDeliveryDistanceCents } from "@/server/delivery/distance-pricing";

const { createAdminClient } = vi.hoisted(() => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient }));
vi.mock("@/server/payments/order-payment-provider-config-service", () => ({
  OrderPaymentProviderConfigService: {
    activeProvider: vi.fn().mockResolvedValue("mercado_pago"),
    recordHealth: vi.fn().mockResolvedValue(undefined),
  },
}));
vi.mock("@/server/payments/mercado-pago-credential-service", () => ({
  getUsableMercadoPagoCredentials: vi.fn().mockResolvedValue({ access_token: "fixture-token", connection_mode: "manual" }),
}));

afterEach(() => vi.unstubAllGlobals());

it("sends the total including road delivery in the Pix order and payment amounts", async () => {
  const feeCents = priceDeliveryDistanceCents(2416);
  const totalCents = 2500 + feeCents;
  const charge = {
    id: "charge", provider: "mercado_pago", status: "creating", payment_id: "payment",
    amount_cents: totalCents, currency: "BRL", external_reference: "reference", idempotency_key: "idempotency",
  };
  const data: Record<string, unknown> = {
    orders: {
      id: "order", organization_id: "organization", store_id: "store", source_cart_id: "cart",
      payment_method_snapshot: "pix", order_status: "received", total_cents: totalCents,
    },
    external_orders: null,
    payments: { id: "payment", status: "pending", amount_cents: totalCents },
    order_payment_provider_charges: null,
    checkout_sessions: { customer_email: "buyer@example.test" },
  };
  const rpc = vi.fn().mockResolvedValue({ data: charge });
  createAdminClient.mockReturnValue({
    rpc,
    from(table: string) {
      let patch: Record<string, unknown> = {};
      return {
        select() { return this; },
        eq() { return this; },
        order() { return this; },
        limit() { return this; },
        update(values: Record<string, unknown>) { patch = values; return this; },
        maybeSingle: async () => ({ data: data[table] }),
        single: async () => ({ data: { ...charge, ...patch } }),
      };
    },
  });
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(Response.json({
    id: "simulated-order", external_reference: "reference", total_amount: "31.00", status: "pending",
    transactions: { payments: [{ amount: "31.00", payment_method: { id: "pix", qr_code: "simulated-qr" } }] },
  }));
  vi.stubGlobal("fetch", fetchMock);

  expect(feeCents).toBe(600);
  await expect(OrderPixService.ensureForOrder("order")).resolves.toMatchObject({
    amountCents: 3100, status: "waiting",
  });
  expect(rpc).toHaveBeenCalledExactlyOnceWith("order_payment_provider_reserve_charge_internal", {
    p_payment_id: "payment", p_provider: "mercado_pago",
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, request] = fetchMock.mock.calls[0] ?? [];
  expect(String(url)).toMatch(/\/v1\/orders$/);
  expect(request?.method).toBe("POST");
  expect(JSON.parse(String(request?.body))).toMatchObject({
    total_amount: "31.00",
    transactions: { payments: [{ amount: "31.00", payment_method: { id: "pix" } }] },
  });
});
