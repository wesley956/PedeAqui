import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { OrderManagerRow } from "@/features/orders/manager-model";
import { orderItemsSummary } from "@/features/orders/manager-model";

vi.mock("@/features/orders/order-action-form", () => ({ OrderActionForm: ({ label }: { label: string }) => createElement("form", null, createElement("button", { type: "submit" }, label)) }));

import { MobileOrderList } from "@/features/orders/mobile-order-list";

const base: OrderManagerRow = { id: "a", display_number: 10, channel: "menu", fulfillment_type: "pickup", order_status: "pending_confirmation", payment_status: "pending", payment_method_snapshot: "cash", production_status: "pending_confirmation", fulfillment_status: "pending", customer_name_snapshot: "João Pedro", total_cents: 3490, created_at: "2026-10-18T22:00:00Z", updated_at: "2026-10-18T22:00:00Z", items_preview: [{ name: "Caixa com 50 salgados", quantity: 1, options: ["Coxinha 17", "Kibe 17"], note: "sem cebola" }] };

describe("pedidos no celular", () => {
  it("summarizes the items in one line", () => {
    expect(orderItemsSummary([{ name: "Coca-Cola 2L", quantity: 2, options: [], note: null }, { name: "Caixa com 30 salgados", quantity: 1, options: [], note: null }])).toBe("2× Coca-Cola 2L · 1× Caixa com 30 salgados");
    expect(orderItemsSummary([])).toBeNull();
  });

  it("renders stage tabs, a compact card with items, one action and the ⋯ menu", () => {
    const html = renderToStaticMarkup(createElement(MobileOrderList, {
      entries: [
        { order: base, tab: "novos", late: false, urgent: true, action: createElement("button", { type: "submit" }, "Aceitar pedido") },
        { order: { ...base, id: "b", display_number: 9, customer_name_snapshot: "Isabela", payment_status: "paid", payment_method_snapshot: "pix" }, tab: "preparo", late: true, action: createElement("button", { type: "submit" }, "Marcar pronto") },
      ],
      tabs: [{ key: "novos", label: "Novos" }, { key: "preparo", label: "Em preparo" }, { key: "prontos", label: "Prontos" }],
      now: Date.parse("2026-10-18T22:03:30Z"),
      query: "",
      onQueryChange: () => undefined,
      soundEnabled: true,
      soundLabel: "Som ativado",
      onToggleSound: () => undefined,
    }));
    expect(html).toMatch(/R\$\s34,90/);
    for (const label of ["Novos", "Em preparo", "Prontos", "Todos", "#10", "João Pedro", "Retirada", "Dinheiro · a receber", "3 min", "1× Caixa com 50 salgados", "Aceitar pedido", "Mais ações do pedido 10"]) expect(html).toContain(label);
    // Abre em "Novos" quando há pedido esperando: o pedido em preparo não aparece até trocar de aba.
    expect(html).not.toContain("Isabela");
  });

  it("is wired into both boards and replaces the full board only on phones", () => {
    for (const file of ["src/features/orders/order-manager-board.tsx", "src/features/orders/custom-order-workflow-board.tsx"]) {
      const source = readFileSync(file, "utf8");
      expect(source).toContain("<MobileOrderList");
      expect(source).toContain('className={styles.mobileOrders}');
    }
    const css = readFileSync("src/features/orders/order-manager.module.css", "utf8");
    expect(css).toContain(".board > :not(.mobileOrders):not(.noticeSlot) { display: none !important; }");
    expect(readFileSync("src/server/orders/order-presentation-service.ts", "utf8")).toContain('from("order_item_modifiers")');
  });
});
