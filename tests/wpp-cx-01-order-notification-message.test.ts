import { describe, expect, it } from "vitest";
import {
  buildOrderNotificationBody,
  buildOrderNotificationTemplateParameters,
  shouldIncludeOrderTrackingLink,
} from "@/server/conversations/order-notification-model";
import type { OrderNotificationSummary } from "@/server/orders/order-notification-summary-service";

const summary: OrderNotificationSummary = {
  orderId: "78000000-0000-4000-8000-000000000003",
  displayNumber: 123,
  channel: "web",
  fulfillmentType: "delivery",
  paymentMethod: "ticket",
  subtotalCents: 5000,
  discountCents: 500,
  deliveryFeeCents: 200,
  totalCents: 4700,
  cancelReason: null,
  items: [
    {
      name: "Coxinha de frango",
      quantity: 2,
      note: "Sem pimenta",
      lineTotalCents: 2400,
      modifiers: [
        { name: "Catupiry", quantity: 1, unitPriceCents: 200 },
      ],
    },
    {
      name: "Caixa com 30 salgados",
      quantity: 1,
      note: null,
      lineTotalCents: 2600,
      modifiers: [
        { name: "Coxinhas", quantity: 15, unitPriceCents: 0 },
        { name: "Bolinhas de queijo", quantity: 10, unitPriceCents: 0 },
        { name: "Salsichas", quantity: 5, unitPriceCents: 0 },
      ],
    },
  ],
};

const base = {
  storeName: "Dona Maria",
  displayNumber: 123,
  trackingUrl: "https://pedeaqui.example/m/dona-maria/pedido/abc/acesso?t=token",
  menuUrl: "https://pedeaqui.example/m/dona-maria",
  customerName: "Cliente",
};

describe("WPP-CX-01 transactional order messages", () => {
  it("renders the first confirmation from canonical order snapshots", () => {
    const body = buildOrderNotificationBody({
      ...base,
      type: "order_received",
      summary,
      includeTrackingLink: true,
    });

    expect(body).toContain("✅ Pedido #123 recebido!");
    expect(body).toContain("🧾 Resumo do pedido");
    expect(body).toMatch(/• 2x Coxinha de frango — R\$\s24,00/);
    expect(body).toMatch(/↳ Catupiry \(\+R\$\s2,00\)/);
    expect(body).toContain("📝 Sem pimenta");
    expect(body).toContain("↳ 15x Coxinhas");
    expect(body).toContain("🚚 Entrega");
    expect(body).toContain("💳 Pagamento: Ticket");
    expect(body).toMatch(/🏷️ Desconto: -R\$\s5,00/);
    expect(body).toMatch(/🚚 Taxa de entrega: R\$\s2,00/);
    expect(body).toMatch(/💰 Total: R\$\s47,00/);
    expect(body).toContain(base.trackingUrl);
  });

  it("does not add an automatic tracking link for WhatsApp-origin orders", () => {
    expect(shouldIncludeOrderTrackingLink("order_received", "whatsapp")).toBe(false);
    const body = buildOrderNotificationBody({
      ...base,
      type: "order_received",
      summary: { ...summary, channel: "whatsapp" },
      includeTrackingLink: false,
    });
    expect(body).not.toContain(base.trackingUrl);
    expect(body).toContain("Agora é só aguardar a confirmação da loja");
  });

  it("keeps later status updates short and without repeated tracking links", () => {
    for (const [type, expected] of [
      ["order_confirmed", "✅ Pedido #123 confirmado!"],
      ["production_preparing", "👩‍🍳 Pedido #123 em preparo"],
      ["out_for_delivery", "🛵 Pedido #123 saiu para entrega"],
      ["delivered", "🎉 Pedido #123 entregue"],
    ] as const) {
      expect(shouldIncludeOrderTrackingLink(type, "web")).toBe(false);
      const body = buildOrderNotificationBody({ ...base, type, includeTrackingLink: false });
      expect(body).toContain(expected);
      expect(body).not.toContain(base.trackingUrl);
    }
  });

  it("uses a canonical cancellation reason only when one exists", () => {
    const withReason = buildOrderNotificationBody({
      ...base,
      type: "order_canceled",
      includeTrackingLink: false,
      cancelReason: "Item indisponível",
    });
    expect(withReason).toContain("Motivo: Item indisponível");

    const withoutReason = buildOrderNotificationBody({
      ...base,
      type: "order_canceled",
      includeTrackingLink: false,
      cancelReason: null,
    });
    expect(withoutReason).not.toContain("Motivo:");
  });

  it("preserves the approved Meta template four-parameter contract", () => {
    expect(buildOrderNotificationTemplateParameters({
      type: "order_confirmed",
      storeName: "Dona Maria",
      displayNumber: 123,
      trackingUrl: base.trackingUrl,
    })).toEqual(["Dona Maria", "#123", "Pedido confirmado", base.trackingUrl]);
  });
});
