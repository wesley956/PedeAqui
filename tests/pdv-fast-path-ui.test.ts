import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const shell = readFileSync(join(process.cwd(), "src/features/pdv/pos-shell.tsx"), "utf8");
const css = readFileSync(join(process.cwd(), "src/features/pdv/pdv.module.css"), "utf8").replace(/\s+/g, "");

describe("PDV fast path", () => {
  it("keeps catalog/search, current selection and final action in the existing flow", () => {
    expect(shell).toContain("Buscar produto, SKU ou código de barras");
    expect(shell).toContain("VENDA ATUAL");
    expect(shell).toContain("Finalizar ·");
  });

  it("gives the catalog more workspace while keeping the sale summary visible", () => {
    expect(css).toContain("grid-template-columns:minmax(0,1.45fr)minmax(360px,.55fr)");
    expect(css).toContain(".cartPanel{position:sticky");
    expect(css).toContain(".section:last-of-type{position:sticky");
  });

  it("uses design-system control heights and responsive single-column layout", () => {
    expect(css).toContain("var(--control-height-lg)");
    expect(css).toContain("@media(max-width:820px)");
    expect(css).toContain(".layout{grid-template-columns:1fr}");
  });

  it("does not change the transactional sale action", () => {
    expect(shell).toContain("createPdvSaleAction(input");
    expect(shell).toContain("paymentPayload(payments");
    expect(shell).toContain("validateModifierSelection");
  });
});
