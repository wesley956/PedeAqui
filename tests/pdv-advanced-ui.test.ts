import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const shell = readFileSync(join(process.cwd(), "src/features/pdv/pos-shell.tsx"), "utf8");
const css = readFileSync(join(process.cwd(), "src/features/pdv/pdv.module.css"), "utf8").replace(/\s+/g, "");

describe("PDV secondary capabilities", () => {
  it("keeps optional customer and benefits inside a native secondary level", () => {
    expect(shell).toContain("<details className={styles.advancedSection}>");
    expect(shell).toContain("Cliente e benefícios");
    expect(shell).toContain("<summary>");
  });

  it("keeps all advanced capabilities mounted so their state is preserved", () => {
    for (const text of ["Buscar por nome, telefone ou e-mail", "Cupom", "Usar cashback", "Usar pontos"]) expect(shell).toContain(text);
    expect(shell).not.toContain("showAdvanced");
  });

  it("keeps payment and finalization in the primary path", () => {
    expect(shell.indexOf("Cliente e benefícios")).toBeLessThan(shell.indexOf("<h3>Pagamento</h3>"));
    expect(shell).toContain("Finalizar ·");
    expect(shell).toContain("createPdvSaleAction(input");
  });

  it("makes the secondary control keyboard and touch friendly", () => {
    expect(css).toContain(".advancedSection>summary:focus-visible");
    expect(css).toContain(".advancedSection>summary{min-height:var(--control-height-lg)");
  });
});
