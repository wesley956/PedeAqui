import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import { OrderManagerBoard, primaryActionForOrder } from "@/features/orders/order-manager-board";
import type { OrderManagerRow } from "@/features/orders/manager-model";

vi.mock("@/features/operations/use-operational-realtime", () => ({ useOperationalRealtime: ({ initialRows }: { initialRows: OrderManagerRow[] }) => ({ rows: initialRows, status: "connected" }), OperationalRealtimeBadge: () => createElement("span", null, "Ao vivo") }));
vi.mock("@/features/orders/use-order-alert", () => ({ useOrderAlert: () => ({ soundEnabled: true, primaryLabel: "Som ativado", toggle: vi.fn(), test: vi.fn(), notifyNewOrder: vi.fn() }) }));
vi.mock("@/features/orders/order-navigation-memory", () => ({ useRememberedOrderSearch: vi.fn() }));
vi.mock("@/features/orders/order-realtime-actions", () => ({ resolveOrderManagerRealtimeAction: vi.fn() }));
vi.mock("@/features/orders/order-preview-action", () => ({ loadOrderPreviewAction: vi.fn() }));
vi.mock("@/features/orders/order-action-form", () => ({ OrderActionForm: ({ label }: { label: string }) => createElement("form", null, createElement("button", { type: "submit" }, label)) }));

const base: OrderManagerRow = { id: "1", display_number: 1, channel: "menu", fulfillment_type: "pickup", order_status: "pending_confirmation", payment_status: "pending", production_status: "pending_confirmation", fulfillment_status: "pending", customer_name_snapshot: "Cliente com nome muito longo para verificar a quebra de linha no celular", total_cents: 8260, created_at: "2026-10-12T06:00:00Z", updated_at: "2026-10-12T06:00:00Z" };
const rows: OrderManagerRow[] = [base, { ...base, id: "2", display_number: 2, customer_name_snapshot: "Maria", order_status: "confirmed", payment_status: "paid", production_status: "preparing" }, { ...base, id: "3", display_number: 3, customer_name_snapshot: "José", order_status: "confirmed", payment_status: "paid", production_status: "ready" }];

describe("attention queue rendered integration", () => {
  it("renders all active orders and their canonical next actions in the initial queue", () => {
    const html = renderToStaticMarkup(createElement(OrderManagerBoard, { storeId: "test", orders: rows, timeZone: "America/Sao_Paulo" }));
    expect(html).toContain("Fila de próximas ações");
    for (const label of ["Aceitar pedido", "Marcar pronto", "Liberar retirada", "Ver resumo", "Ver detalhes"]) expect(html).toContain(label);
    expect(html.indexOf("#1")).toBeLessThan(html.indexOf("#3"));
    expect(html).not.toContain("Carregando itens");
    if (process.env.VISUAL_FIXTURE_PATH) fs.writeFileSync(process.env.VISUAL_FIXTURE_PATH, html);
  });
  it("exposes the same served action as the full detail for ready consume-on-site orders", () => {
    expect(primaryActionForOrder({ ...base, order_status: "confirmed", production_status: "ready", fulfillment_type: "counter" }, "standard", false)).toEqual({ intent: "served", label: "Marcar servido" });
    expect(primaryActionForOrder({ ...base, order_status: "confirmed", production_status: "ready", fulfillment_type: "counter", fulfillment_status: "served", payment_status: "paid" }, "standard", false)?.intent).toBe("complete");
  });
  it("renders an empty queue without occupying a detail pane", () => {
    const html = renderToStaticMarkup(createElement(OrderManagerBoard, { storeId: "test", orders: [], timeZone: "America/Sao_Paulo" }));
    expect(html).toContain("Nenhum pedido ativo");
    expect(html).not.toContain("Resumo do pedido");
  });
});
