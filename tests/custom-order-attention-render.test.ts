import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CustomOrderWorkflowBoard } from "@/features/orders/custom-order-workflow-board";
import type { OrderManagerRow } from "@/features/orders/manager-model";
import type { CustomWorkflowConfig } from "@/features/orders/workflow-config";

vi.mock("@/features/operations/use-operational-realtime", () => ({ useOperationalRealtime: ({ initialRows }: { initialRows: OrderManagerRow[] }) => ({ rows: initialRows, status: "connected" }), OperationalRealtimeBadge: () => createElement("span", null, "Ao vivo") }));
vi.mock("@/features/orders/use-order-alert", () => ({ useOrderAlert: () => ({ soundEnabled: true, primaryLabel: "Som ativado", toggle: vi.fn(), test: vi.fn(), notifyNewOrder: vi.fn() }) }));
vi.mock("@/features/orders/order-navigation-memory", () => ({ useRememberedOrderSearch: vi.fn() }));
vi.mock("@/features/orders/order-realtime-actions", () => ({ resolveOrderManagerRealtimeAction: vi.fn() }));
vi.mock("@/features/orders/order-preview-action", () => ({ loadOrderPreviewAction: vi.fn() }));
vi.mock("@/features/orders/actions", () => ({ bulkQuickFinishAction: vi.fn() }));
vi.mock("@/features/orders/order-action-form", () => ({ OrderActionForm: ({ label, intent }: { label: string; intent: string }) => createElement("form", null, createElement("button", { type: "submit", "data-intent": intent }, label)) }));

const base: OrderManagerRow = { id: "one", display_number: 27, channel: "pdv", fulfillment_type: "counter", order_status: "confirmed", payment_status: "paid", payment_method_snapshot: "cash", production_status: "ready", fulfillment_status: "pending", customer_name_snapshot: "Consumidor", total_cents: 8260, created_at: "2026-10-12T06:00:00Z", updated_at: "2026-10-12T06:00:00Z" };
const config: CustomWorkflowConfig = { delivery: ["new", "finished"], pickup: ["new", "finished"], quickFinish: false };
const render = (orders: OrderManagerRow[], workflow = config) => renderToStaticMarkup(createElement(CustomOrderWorkflowBoard, { storeId: "test", orders, config: workflow, timeZone: "America/Sao_Paulo" }));

describe("custom workflow uses attention views without replacing configured actions", () => {
  it("renders a ready order as Pronto in the queue even when the configured board folds it into Novo", () => {
    const html = render([base]);
    expect(html).toContain("Fila de próximas ações");
    expect(html).toContain("Marcar servido");
    expect(html).toContain('data-intent="served"');
    expect(html).toContain("Pronto");
    expect(html).toContain("Ver resumo");
  });
  it("preserves quick finish and bulk eligibility in the initial queue", () => {
    const html = render([base], { ...config, quickFinish: true });
    expect(html).toContain('data-intent="quick_finish"');
    expect(html).toContain("Selecionar elegíveis");
    expect(html).toContain("Selecionar pedido #27");
    expect(html).not.toContain('data-intent="served"');
  });
  it("keeps refund state visible and preserves managed delivery continuation", () => {
    const html = render([{ ...base, fulfillment_type: "delivery", fulfillment_status: "out_for_delivery", payment_status: "refunded" }]);
    expect(html).toContain("Estornado");
    expect(html).toContain("Continuar na Central de Entregas");
    expect(html).not.toContain('data-intent="quick_finish"');
  });
});
