import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const pdv = readFileSync("src/features/pdv/pos-shell.tsx", "utf8");
const contracts = readFileSync("src/server/product-experience/contracts.ts", "utf8");

describe("PDV finalization observability #1351", () => {
  it("tracks validation blocks before the server call without recording personal data", () => {
    const flow = pdv.slice(pdv.indexOf("async function finalizeSale("), pdv.indexOf("return (\n    <section", pdv.indexOf("async function finalizeSale(")));
    expect(flow).toContain('reportFinalization("failure", "empty_cart"');
    expect(flow).toContain('reportFinalization("failure", "payment_validation"');
    expect(flow).toContain('reportFinalization("failure", "customer_validation"');
    expect(flow).toContain('reportFinalization("failure", "benefit_validation"');
    expect(flow).toContain('reportFinalization("failure", "no_payment_methods"');
  });

  it("records server rejection, success, and uncertain response separately", () => {
    expect(pdv).toContain('reportFinalization("failure", "server_rejected"');
    expect(pdv).toContain('reportFinalization("success", "created_or_replayed"');
    expect(pdv).toContain('reportFinalization("unknown", "response_uncertain"');
    expect(pdv).toContain("Confira o histórico antes de tentar novamente");
    expect(pdv).toContain("createPdvSaleAction(input, `${sessionNonce}:${revision}`)");
  });

  it("uses the existing allowlisted metadata without sending personal identifiers", () => {
    const tracker = pdv.slice(pdv.indexOf("function reportFinalization("), pdv.indexOf("async function finalizeSale("));
    expect(tracker).toContain('eventName: "px.order.action"');
    expect(tracker).toContain('action: "finalize_sale"');
    expect(tracker).toContain('surface: "pdv"');
    expect(tracker).not.toMatch(/customerName|customerPhone|customerEmail|cart|payment\.reference|idempotencyKey/);
    expect(contracts).toContain('"px.order.action": new Set(["action", "surface", "workflow_mode", "result"])');
  });
});
