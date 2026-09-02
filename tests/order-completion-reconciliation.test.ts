import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("safe completion reconciliation [818]", () => {
  const service = read("src/server/orders/order-service.ts");
  const actions = read("src/features/orders/actions.ts");
  const page = read("src/app/(app)/pedidos/page.tsx");

  it("keeps fulfillment and payment as independent completion gates", () => {
    expect(service).toContain("fulfillmentIsComplete(order.fulfillment_status");
    expect(service).toContain("paymentAllowsOrderCompletion(order.payment_status");
    expect(service).toContain("Fulfilled order cannot be canceled or rejected");
  });

  it("reconciles through the authoritative idempotent transition with an audit reason", () => {
    expect(service).toContain("static reconcileCompletion");
    expect(service).toContain("Reconciliação de pedido com atendimento finalizado");
    expect(service).toContain('admin.rpc("order_transition_internal"');
    expect(actions).toContain('case "complete": await OrderService.reconcileCompletion(orderId)');
  });

  it("warns about paid reconciliation and pending payment without inventing payment", () => {
    expect(page).toContain("pedido(s) com atendimento finalizado");
    expect(page).toContain("podem ser concluídos com segurança");
    expect(page).toContain("não dará baixa automaticamente");
    const completionCase = actions.slice(actions.indexOf('case "complete"'), actions.indexOf('case "print"'));
    expect(completionCase).not.toContain("confirmDefaultForOrder");
  });
});
