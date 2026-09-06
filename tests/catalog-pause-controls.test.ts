import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("catalog pause controls", () => {
  const actions = read("src/features/catalog/actions.ts");
  const categoriesPage = read("src/app/(app)/cardapio/categorias/page.tsx");
  const productsPage = read("src/app/(app)/cardapio/produtos/page.tsx");
  const modifiersPage = read("src/app/(app)/cardapio/adicionais/page.tsx");
  const modifierService = read("src/server/catalog/modifier-service.ts");

  it("offers reversible quick actions for every catalog level", () => {
    expect(categoriesPage).toContain("Pausar categoria");
    expect(categoriesPage).toContain("Reativar categoria");
    expect(productsPage).toContain("Pausar produto");
    expect(productsPage).toContain("Reativar produto");
    expect(modifiersPage).toContain("Pausar grupo");
    expect(modifiersPage).toContain("Reativar grupo");
    expect(modifiersPage).toContain("Pausar opção");
    expect(modifiersPage).toContain("Reativar opção");
  });

  it("uses resilient server actions and preserves tenant scoping", () => {
    for (const action of [
      "setCategoryActiveFormAction",
      "setProductAvailabilityFormAction",
      "setModifierGroupActiveFormAction",
      "setModifierActiveFormAction",
    ]) expect(actions).toContain(action);
    expect(modifierService).toContain('.eq("organization_id", context.organizationId).eq("store_id", storeId)');
  });

  it("supports one atomic update for equivalent names and protects required groups", () => {
    expect(modifiersPage).toContain("Aplicar ao mesmo sabor em todos os grupos");
    expect(modifierService).toContain('scope: "single" | "matching_name"');
    expect(modifierService).toContain("normalizedCatalogName");
    expect(modifierService).toContain('.in("id", affectedIds)');
    expect(modifierService).toContain("ficaria sem escolhas suficientes");
  });

  it("records availability changes without soft-deleting catalog records", () => {
    expect(modifierService).toContain("modifier_group.availability_changed");
    expect(modifierService).toContain("modifier.availability_changed");
    const availabilitySection = modifierService.slice(modifierService.indexOf("static async setModifierActive"));
    expect(availabilitySection.split("static async linkGroupToProduct")[0]).not.toContain("deleted_at:");
  });
});
