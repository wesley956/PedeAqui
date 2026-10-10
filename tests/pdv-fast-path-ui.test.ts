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

  it("keeps payment and finalization outside the scrolling catalog and cart", () => {
    const bar = shell.indexOf('<footer className={styles.checkoutBar}');
    const dialog = shell.indexOf('<Dialog open={paymentDialogOpen}');
    expect(bar).toBeGreaterThan(shell.indexOf('<section className={`card ${styles.cartPanel}`}'));
    expect(shell.slice(0, bar).trimEnd()).toMatch(/<\/section>\s*<\/div>$/);
    expect(shell.slice(bar, dialog)).toContain('aria-label="Valor recebido em dinheiro"');
    expect(shell.slice(bar, dialog)).toContain('type="submit"');
    expect(shell.slice(bar, dialog)).toContain('</fieldset>');
    expect(shell.slice(bar, dialog)).toContain('</form>');
    expect(css).toContain('.checkoutBar{flex:00auto;position:sticky');
    expect(css).toContain('.checkoutBar{position:static}');
    expect(css).toContain('.cartPanel{grid-template-rows:autominmax(0,1fr)}');
  });

  it("uses design-system control heights and responsive single-column layout", () => {
    expect(css).toContain("var(--control-height-lg)");
    expect(css).toContain("@media(max-width:820px)");
    expect(css).toContain(".layout{grid-template-columns:1fr}");
  });

  it("keeps the cart total and current step reachable on narrow screens", () => {
    expect(shell).toContain('aria-label="Etapa atual da venda"');
    expect(shell).toContain('data-mobile-view={mobileView}');
    expect(shell).toContain('Venda · {cartItemCount}');
    expect(css).toContain('.mobileViewSwitcher{position:sticky');
    expect(css).toContain('.layout[data-mobile-view="catalog"][data-pdv-panel="sale"]');
    expect(css).toContain('.layout[data-mobile-view="sale"][data-pdv-panel="catalog"]');
  });

  it("does not change the transactional sale action", () => {
    expect(shell).toContain("createPdvSaleAction(input");
    expect(shell).toContain("paymentPayload(payments");
    expect(shell).toContain("validateModifierSelection");
  });
});
