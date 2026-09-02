import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("UX residual for orders and catalog", () => {
  it("preserves active search, history filters and scroll across order details", () => {
    const memory = read("src/features/orders/order-navigation-memory.tsx");
    const board = read("src/features/orders/order-manager-board.tsx");
    const history = read("src/app/(app)/pedidos/historico/page.tsx");
    const detail = read("src/app/(app)/pedidos/[id]/page.tsx");
    expect(memory).toContain("sessionStorage");
    expect(memory).toContain("window.scrollTo");
    expect(board).toContain('useRememberedOrderSearch("orders:active:query"');
    expect(history).toContain("returnTo");
    expect(detail).toContain("Voltar sem perder sua posição");
  });

  it("keeps rejection administrative and one primary action in the detail surface", () => {
    const detail = read("src/app/(app)/pedidos/[id]/page.tsx");
    const primarySection = detail.slice(detail.indexOf('className={styles.nextAction}'), detail.indexOf('</article>', detail.indexOf('className={styles.nextAction}')));
    expect(primarySection).not.toContain('intent="reject"');
    expect(detail).toContain("Ações administrativas");
    expect(detail).toContain("Impressão requer atenção");
    expect(detail).toContain("Pagamento ainda pendente");
    expect(detail).toContain("Entrega sem responsável");
  });

  it("uses shared form controls throughout residual catalog CRUD", () => {
    const categories = read("src/app/(app)/cardapio/categorias/page.tsx");
    const modifiers = read("src/app/(app)/cardapio/adicionais/page.tsx");
    const suggestions = read("src/app/(app)/cardapio/sugestoes/page.tsx");
    for (const surface of [categories, modifiers, suggestions]) expect(surface).toContain("@/components/ui/form-controls");
    for (const control of ["Checkbox", "QuantityInput", "SelectField", "MoneyInput"]) expect(modifiers).toContain(control);
    expect(modifiers).not.toContain("selectStyle");
  });

  it("preserves catalog rules and quick out-of-stock operation", () => {
    const products = read("src/app/(app)/cardapio/produtos/page.tsx");
    const editor = read("src/app/(app)/cardapio/produtos/[id]/page.tsx");
    const modifiers = read("src/app/(app)/cardapio/adicionais/page.tsx");
    expect(products).toContain("Marcar esgotado");
    for (const field of ["price", "promotionalPrice", "imageFile", "availability"]) expect(editor).toContain(`name="${field}"`);
    for (const rule of ["minSelection", "maxSelection", "distributionTotal", "selectionMode"]) expect(modifiers).toContain(`name="${rule}"`);
  });
});
