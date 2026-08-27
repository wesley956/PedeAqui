import { describe, expect, it } from "vitest";
import { renderPrintDocument } from "@/server/printing/templates";

const payload = {
  order: {
    id: "00000000-0000-0000-0000-000000000001",
    display_number: 42,
    channel: "menu",
    fulfillment_type: "delivery",
    customer_name: "Maria",
    customer_phone: "11999999999",
    address: { street: "Rua A", number: "10", district: "Centro", city: "Americana", state: "SP", reference: "Portão azul" },
    subtotal_cents: 3500,
    discount_cents: 0,
    delivery_fee_cents: 500,
    total_cents: 4000,
    payment_method: "pix",
    cash_change_for_cents: null,
    created_at: "2026-08-10T20:00:00.000Z",
    confirmed_at: "2026-08-10T20:05:00.000Z",
    timezone: "America/Sao_Paulo",
  },
  station: { id: "s1", name: "Chapa", code: "chapa", kind: "production" },
  items: [{ name: "X-Burger", quantity: 2, note: "Sem cebola", line_total_cents: 3500, modifiers: [{ name: "Bacon", group: "Adicionais", unit_price_cents: 500 }] }],
};

describe("thermal print templates", () => {
  it("keeps kitchen ticket operational and without financial/customer data", () => {
    const text = renderPrintDocument(payload, "kitchen", 80);
    expect(text).toContain("PEDIDO #42");
    expect(text).toContain("2x X-Burger");
    expect(text).toContain("+ Bacon");
    expect(text).toContain("OBS: Sem cebola");
    expect(text).not.toContain("Maria");
    expect(text).not.toContain("Pagamento");
    expect(text).not.toContain("TOTAL");
  });

  it("renders expedition data and visibly marks reprints", () => {
    const text = renderPrintDocument(payload, "expedition", 58, true);
    expect(text).toContain("*** REIMPRESSAO ***");
    expect(text).toContain("CLIENTE: Maria");
    expect(text).toContain("ENDERECO: Rua A, Nº 10");
    expect(text).toContain("Pagamento: pix");
    expect(text).toContain("TOTAL");
  });
});
