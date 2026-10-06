import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(file, "utf8");

describe("bulk quick finish #1208", () => {
  const actions = read("src/features/orders/actions.ts");
  const board = read("src/features/orders/custom-order-workflow-board.tsx");

  it("accepts a bounded unique list and processes orders sequentially", () => {
    expect(actions).toContain("z.array(z.string().uuid()).min(1).max(50)");
    expect(actions).toContain("Array.from(new Set(formData.getAll(\"orderIds\")");
    expect(actions).toContain("for (const orderId of parsed.data)");
    expect(actions).toContain("await OrderQuickFinishService.finish(orderId, paymentReceived)");
    expect(actions).not.toContain("Promise.all(parsed.data");
  });

  it("revalidates operational surfaces once after the batch instead of per item", () => {
    const bulkAction = actions.slice(
      actions.indexOf("export async function bulkQuickFinishAction"),
      actions.indexOf("const managerIntentSchema"),
    );
    expect(bulkAction.match(/revalidatePath\("\/pedidos"\)/g)?.length).toBe(1);
    expect(bulkAction.match(/revalidatePath\("\/entregas"\)/g)?.length).toBe(1);
    expect(bulkAction).not.toContain("refreshOrder(orderId)");
  });

  it("keeps partial failure isolation and does not stop the remaining orders", () => {
    expect(actions).toContain("failed += 1");
    expect(actions).toContain("order_bulk_quick_finish_failed");
    expect(actions).toContain("permaneceram no quadro");
  });

  it("only exposes bulk selection to native quick-finish orders with safe payment state", () => {
    expect(board).toContain("function canBulkQuickFinish");
    expect(board).toContain("if (!isQuickFinishFlow(order, config, manualDeliveryMode)) return false");
    expect(board).toContain("offlineBulkPaymentMethods");
    expect(board).toContain('const offlineBulkPaymentMethods = new Set(["cash", "credit_card", "debit_card"])');
  });

  it("requires an explicit payment confirmation when selected orders still have offline payment pending", () => {
    expect(board).toContain("selectedPendingPayments.length > 0");
    expect(board).toContain("Você confirma que recebeu o pagamento");
    expect(board).toContain('name="paymentReceived" value="yes"');
  });

  it("offers per-card selection plus select-all and one batch submit", () => {
    expect(board).toContain("Selecionar pedido #");
    expect(board).toContain("Selecionar elegíveis");
    expect(board).toContain("Finalizar selecionados");
    expect(board).toContain('name="orderIds"');
    expect(board).toContain("Processamento controlado, um pedido por vez.");
  });
});
