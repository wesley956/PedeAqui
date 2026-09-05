import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const board = fs.readFileSync(
  path.join(process.cwd(), "src/features/orders/order-manager-board.tsx"),
  "utf8",
);
const page = fs.readFileSync(
  path.join(process.cwd(), "src/app/(app)/pedidos/page.tsx"),
  "utf8",
);

describe("simplified manual delivery board contract", () => {
  it("keeps exactly three visible columns when delivery is handled manually", () => {
    expect(board).toContain("const simplifiedColumns = [");
    expect(board).not.toContain("const simplifiedColumns = manualDeliveryMode");
    expect(board).toContain('{ key: "start", label: "Iniciar"');
    expect(board).toContain('{ key: "ready", label: "Pronto"');
    expect(board).toContain('{ key: "completed", label: "Finalizados"');
    expect(board).not.toContain('{ key: "delivering", label: "Em entrega"');
    expect(board).not.toContain('{ key: "finish", label: "Finalizar"');
  });

  it("keeps manual delivery transitions inside each order card", () => {
    expect(board).toContain('intent: "manual_out_for_delivery"');
    expect(board).toContain('intent: "manual_finish_delivery"');
  });

  it("describes the simplified flow as three cards even in manual delivery", () => {
    expect(page).toContain("Fluxo simplificado: Iniciar → Pronto → Finalizados.");
    expect(page).toContain("A entrega manual continua dentro do próprio pedido.");
  });
});
