import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("PedeAqui Intelligence Core architecture baseline", () => {
  const adr = read("docs/adr/INTELLIGENCE_CORE.md");
  const sourceMatrix = read("docs/intelligence/SOURCE_OF_TRUTH_MATRIX.md");
  const directAccess = read("docs/intelligence/DIRECT_ACCESS_INVENTORY.md");
  const regressions = read("docs/intelligence/PROTECTED_REGRESSION_CHECKLIST.md");
  const dependencies = read("docs/intelligence/DEPENDENCY_MAP.md");

  it("pins the audited baseline and canonical flow", () => {
    expect(adr).toContain("67977c3cb990371bf7581d7f1db53ce04c35e9f8");
    expect(adr).toContain("IntelligenceContext -> Capability -> Authority -> Tool/Adapter");
    expect(adr).toContain("No Intelligence component may own a parallel state machine");
  });

  it("maps every critical source-of-truth domain", () => {
    for (const domain of [
      "Customer identity", "Public catalog/menu", "Pricing", "Cart", "Checkout",
      "Order/workflow", "Production/KDS", "Delivery quote", "Payment/Pix status",
      "Growth", "Modules/entitlement/RBAC", "Omnichannel/iFood", "Conversations",
      "Handoff/Coexistence", "Printing", "PDV", "Dining/salon", "Gas", "Inventory",
      "Cash", "Fiscal", "Purchases", "Operational health",
    ]) expect(sourceMatrix).toContain(`| ${domain} |`);
  });

  it("classifies direct access and freezes critical stop conditions", () => {
    expect(directAccess).toContain("permitido");
    expect(directAccess).toContain("migrar para adapter");
    expect(directAccess).toContain("migrar para adapter / remover");
    for (const condition of ["cross-tenant", "price/payment/status mismatch", "duplicate order", "human mode", "print/KDS"]) {
      expect(regressions).toContain(condition);
    }
  });

  it("keeps future phases gated and outside INT-01", () => {
    for (const issue of ["INT-02", "INT-03", "INT-04", "INT-05", "INT-06", "INT-07", "INT-08", "INT-09"]) {
      expect(dependencies).toContain(issue);
    }
    expect(dependencies).toContain("They do not authorize the");
  });

  it("freezes the production diagnostic outcome invariants from #1050", () => {
    expect(adr).toContain("`inbound -> nothing` is forbidden");
    expect(sourceMatrix).toContain("9 conversations ending with inbound");
    expect(directAccess).toContain("14 conversation rows with no");
    expect(regressions).toContain("every persisted inbound reaches exactly one traceable");
    expect(dependencies).toContain("measure inbound-to-action/outbound latency");
  });
});
