import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const productsPage = readFileSync("src/app/(app)/cardapio/produtos/page.tsx", "utf8");
const layout = readFileSync("src/app/(app)/cardapio/layout.tsx", "utf8");
const navigation = readFileSync("src/app/(app)/cardapio/catalog-navigation.tsx", "utf8");
const styles = readFileSync("src/app/(app)/cardapio/catalog-management.module.css", "utf8");

describe("catalog management UI", () => {
  it("keeps the catalog work areas explicit through the shared navigation", () => {
    expect(layout).toContain("<CatalogNavigation />");
    for (const label of ["Produtos", "Categorias", "Adicionais", "Sugestões"]) expect(navigation).toContain(label);
  });

  it("provides quick search and operational filters", () => {
    expect(productsPage).toContain("SearchInput");
    expect(productsPage).toContain('name="status"');
    expect(productsPage).toContain('name="category"');
    expect(productsPage).toContain("Nenhum produto encontrado");
  });

  it("preserves server-side availability and duplication actions", () => {
    expect(productsPage).toContain("setProductAvailabilityAction");
    expect(productsPage).toContain("duplicateProductAction");
    expect(productsPage).not.toContain("supabase");
  });

  it("keeps a responsive catalog navigation without horizontal scrolling", () => {
    expect(styles).toContain("@media (max-width: 640px)");
    expect(styles).toContain("grid-template-columns: repeat(2, minmax(0, 1fr))");
    expect(styles).not.toContain("overflow-x: auto");
  });
});
