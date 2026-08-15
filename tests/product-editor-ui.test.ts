import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/app/(app)/cardapio/produtos/novo/page.tsx", "utf8");
const styles = readFileSync("src/app/(app)/cardapio/produtos/novo/product-editor.module.css", "utf8");

describe("product editor UI", () => {
  it("keeps the common product fields in explicit sections", () => {
    for (const label of ["Informações básicas", "Preço", "Imagem", "Disponibilidade", "Adicionais e opções"]) {
      expect(page).toContain(label);
    }
  });

  it("keeps technical fields in a progressive disclosure section", () => {
    expect(page).toContain("<details");
    expect(page).toContain("Dados avançados e operacionais");
    expect(page).toContain('name="cost"');
    expect(page).toContain('name="sku"');
    expect(page).toContain('name="barcode"');
  });

  it("preserves the authoritative create action and commercial field contract", () => {
    expect(page).toContain("createProductAction");
    for (const name of ["name", "description", "categoryId", "price", "promotionalPrice", "cost", "imageFile", "availability", "active", "preparationTimeMinutes"]) {
      expect(page).toContain(`name="${name}"`);
    }
    expect(page).not.toContain('name="imageUrl"');
  });

  it("has a compact mobile layout and sticky save area", () => {
    expect(styles).toContain("position: sticky");
    expect(styles).toContain("@media (max-width: 640px)");
    expect(styles).toContain("grid-template-columns: 1fr");
  });
});
