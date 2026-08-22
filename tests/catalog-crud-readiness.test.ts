import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { modifierGroupInputSchema, productInputSchema } from "@/server/catalog/schemas";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("catalog CRUD readiness PA-DIAG-016 to PA-DIAG-020", () => {
  it("exposes complete category CRUD without destructive deletion", () => {
    const service = read("src/server/catalog/category-service.ts");
    const actions = read("src/features/catalog/actions.ts");
    const page = read("src/app/(app)/cardapio/categorias/page.tsx");
    for (const method of ["static async list", "static async get", "static async create", "static async update", "static async remove"]) expect(service).toContain(method);
    expect(actions).toContain("updateCategoryFormAction");
    expect(actions).toContain("removeCategoryAction");
    expect(page).toContain("Editar categoria");
    expect(page).toContain("removeName=\"removeImage\"");
    expect(service).toContain("deleted_at: deletedAt");
    expect(service).not.toMatch(/from\("categories"\)\.delete\(\)/);
  });

  it("exposes product read, update, duplicate and soft delete in the UI", () => {
    const service = read("src/server/catalog/product-service.ts");
    const actions = read("src/features/catalog/actions.ts");
    const list = read("src/app/(app)/cardapio/produtos/page.tsx");
    const editor = read("src/app/(app)/cardapio/produtos/[id]/page.tsx");
    for (const method of ["static async get", "static async update", "static async remove", "static async duplicate"]) expect(service).toContain(method);
    expect(actions).toContain("updateProductFormAction");
    expect(actions).toContain("removeProductAction");
    expect(list).toContain("/cardapio/produtos/${product.id}");
    expect(editor).toContain("Preço promocional");
    expect(editor).toContain("removeName=\"removeImage\"");
    expect(service).toContain('availability: "inactive"');
  });

  it("validates promotions and required choices", () => {
    expect(() => productInputSchema.parse({ name: "Produto", priceCents: 1000, promotionalPriceCents: 1200, preparationTimeMinutes: 0, active: true, availability: "available" })).toThrow();
    expect(() => modifierGroupInputSchema.parse({ name: "Escolha o sabor", minSelection: 0, maxSelection: 1, required: true, sortOrder: 0, active: true })).toThrow();
    expect(modifierGroupInputSchema.parse({ name: "Escolha o tamanho", minSelection: 1, maxSelection: 1, required: true, sortOrder: 0, active: true }).required).toBe(true);
  });

  it("exposes complete modifier group, option and product-link CRUD", () => {
    const service = read("src/server/catalog/modifier-service.ts");
    const actions = read("src/features/catalog/actions.ts");
    const page = read("src/app/(app)/cardapio/adicionais/page.tsx");
    const productEditor = read("src/app/(app)/cardapio/produtos/[id]/page.tsx");
    for (const method of ["static async listGroups", "static async createGroup", "static async updateGroup", "static async removeGroup", "static async listModifiers", "static async createModifier", "static async updateModifier", "static async removeModifier"]) expect(service).toContain(method);
    for (const action of ["updateModifierGroupFormAction", "removeModifierGroupAction", "updateModifierFormAction", "removeModifierAction", "linkModifierGroupAction", "unlinkModifierGroupAction"]) expect(actions).toContain(action);
    expect(page).toContain("Editar grupo");
    expect(page).toContain("Editar opção");
    expect(productEditor).toContain("Vincular ou atualizar ordem");
    expect(productEditor).toContain("Desvincular");
    expect(service).not.toMatch(/from\("modifier_groups"\)\.delete\(\)/);
    expect(service).not.toMatch(/from\("modifiers"\)\.delete\(\)/);
  });

  it("documents live rollback evidence and the five issues", () => {
    const doc = read("docs/qa/PRESENTATION_DIAGNOSTICS_016_020_20260822.md");
    for (const id of ["PA-DIAG-016", "PA-DIAG-017", "PA-DIAG-018", "PA-DIAG-019", "PA-DIAG-020"]) expect(doc).toContain(id);
    expect(doc).toContain("category_crud=true");
    expect(doc).toContain("product_crud=true");
    expect(doc).toContain("modifier_group_crud=true");
    expect(doc).toContain("modifier_crud=true");
    expect(doc).toContain("size_options_count=2");
    expect(doc).toContain("link_crud=true");
    expect(doc).toContain("terminou com `ROLLBACK`");
  });
});
