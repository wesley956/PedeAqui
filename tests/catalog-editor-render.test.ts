import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import CategoriesPage from "@/app/(app)/cardapio/categorias/page";
import ModifiersPage from "@/app/(app)/cardapio/adicionais/page";
import EditProductPage from "@/app/(app)/cardapio/produtos/[id]/page";
import NewProductPage from "@/app/(app)/cardapio/produtos/novo/page";
import catalogStyles from "@/app/(app)/cardapio/catalog-management.module.css";
import editorStyles from "@/app/(app)/cardapio/produtos/novo/product-editor.module.css";
import controlStyles from "@/components/ui/form-controls.module.css";
import imageStyles from "@/components/media/image-upload-field.module.css";
import buttonStyles from "@/components/ui/button.module.css";

const fixtures = vi.hoisted(() => ({
  categories: ["cat-a", "cat-b"].map((id) => ({ id, name: `Categoria ${id}`, sort_order: 2, description: "Descrição da categoria", active: true, image_url: null })),
  groups: ["group-a", "group-b"].map((id) => ({ id, name: `Sabores ${id}`, description: "Escolha seus sabores", selection_mode: "equal_split_options", distribution_total: 50, min_selection: 1, max_selection: 2, sort_order: 3, active: true, required: true })),
  modifiers: ["option-a", "option-b"].map((id, i) => ({ id, modifier_group_id: i ? "group-b" : "group-a", name: `Opção ${id}`, price_cents: 125, sort_order: 4, active: true })),
}));

vi.mock("@/server/catalog/category-service", () => ({ CategoryService: { list: vi.fn(async () => fixtures.categories) } }));
vi.mock("@/server/catalog/modifier-service", () => ({ ModifierService: { listGroups: vi.fn(async () => fixtures.groups), listModifiers: vi.fn(async () => fixtures.modifiers), listProductGroupLinks: vi.fn(async () => [{ modifier_group_id: "group-a", sort_order: 7 }]) } }));
vi.mock("@/server/catalog/product-service", () => ({ ProductService: { get: vi.fn(async () => ({ id: "product-a", name: "Produto de teste", description: "Descrição", price_cents: 1990, promotional_price_cents: null, cost_cents: 800, category_id: "cat-a", image_url: null, availability: "available", active: true, preparation_time_minutes: 10, sort_order: 5, sku: "TEST", barcode: "123" })) } }));
vi.mock("@/features/catalog/actions", () => Object.fromEntries(["createCategoryFormAction", "setCategoryActiveFormAction", "updateCategoryFormAction", "removeCategoryAction", "createModifierFormAction", "createModifierGroupFormAction", "removeModifierAction", "removeModifierGroupAction", "setModifierActiveFormAction", "setModifierGroupActiveFormAction", "updateModifierFormAction", "updateModifierGroupFormAction", "linkModifierGroupAction", "unlinkModifierGroupAction", "updateProductFormAction", "createProductFormAction"].map((name) => [name, Object.assign(async () => ({ ok: true, message: "Salvo" }), { actionName: name })])));
vi.mock("@/features/catalog/category-duplication-actions", () => ({ duplicateCategoryFormAction: Object.assign(async () => ({ ok: true, message: "Copiado" }), { actionName: "duplicateCategoryFormAction" }) }));
vi.mock("@/features/catalog/resilient-mutation-form", () => ({ ResilientMutationForm: ({ action, children, successReset = true, ...props }: { action: { actionName: string }; children: ReactNode; successReset?: boolean }) => createElement("form", { ...props, "data-action": action.actionName, "data-reset": String(successReset) }, children) }));

function idsAreUnique(html: string) {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  expect(ids.length).toBeGreaterThan(0);
  expect(new Set(ids).size).toBe(ids.length);
  for (const [, target] of html.matchAll(/\sfor="([^"]+)"/g)) expect(ids).toContain(target);
}

function forms(html: string, action: string) {
  return [...html.matchAll(/<form\b[^>]*data-action="([^"]+)"[^>]*>(.*?)<\/form>/gs)].filter((match) => match[1] === action).map((match) => match[2]);
}

function exportVisualFixture(name: string, html: string) {
  if (!process.env.PEDEAQUI_EDITOR_QA_DIR) return;
  const sources: Array<[string, Record<string, string>]> = [
    ["src/app/(app)/cardapio/catalog-management.module.css", catalogStyles],
    ["src/app/(app)/cardapio/produtos/novo/product-editor.module.css", editorStyles],
    ["src/components/ui/form-controls.module.css", controlStyles],
    ["src/components/media/image-upload-field.module.css", imageStyles],
    ["src/components/ui/button.module.css", buttonStyles],
  ];
  const css = readFileSync("src/app/globals.css", "utf8") + sources.map(([path, mapping]) => readFileSync(path, "utf8").replace(/\.([a-zA-Z_][\w-]*)/g, (token, key: string) => mapping[key] ? `.${mapping[key]}` : token)).join("\n");
  mkdirSync(process.env.PEDEAQUI_EDITOR_QA_DIR, { recursive: true });
  writeFileSync(`${process.env.PEDEAQUI_EDITOR_QA_DIR}/${name}.html`, `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}body{margin:0;padding:16px}main{max-width:1100px;margin:auto}</style><main>${html}</main></html>`);
}

describe("catalog editors preserve independent payloads and accessible repeated controls", () => {
  it("keeps category identity, existing values and duplication scope in separate forms", async () => {
    const html = renderToStaticMarkup(await CategoriesPage());
    idsAreUnique(html);
    const edits = forms(html, "updateCategoryFormAction");
    expect(edits).toHaveLength(2);
    edits.forEach((form, i) => {
      const category = fixtures.categories[i];
      if (!category) throw new Error("Missing category fixture");
      expect(form).toContain(`name="categoryId" value="${category.id}"`);
      expect(form).toContain(`value="${category.name}"`);
      expect(form).toContain('name="sortOrder"');
      expect(form).toContain('name="removeImage"');
    });
    expect(forms(html, "duplicateCategoryFormAction")[0]).toContain('name="includeProducts"');
    expect(forms(html, "setCategoryActiveFormAction")[0]).toContain('name="active" value="false"');
    exportVisualFixture("categories", html);
  });
  it("retains equal-split rules and matching-name availability even in collapsed option editors", async () => {
    const html = renderToStaticMarkup(await ModifiersPage());
    idsAreUnique(html);
    const edits = forms(html, "updateModifierGroupFormAction");
    expect(edits).toHaveLength(2);
    for (const form of edits) {
      expect(form).toContain('value="equal_split_options" selected=""');
      expect(form).toContain('name="distributionTotal"');
      expect(form).toContain('value="50"');
      for (const name of ["minSelection", "maxSelection", "required", "active"]) expect(form).toContain(`name="${name}"`);
    }
    const availability = forms(html, "setModifierActiveFormAction");
    expect(availability).toHaveLength(2);
    for (const form of availability) expect(form).toMatch(/name="allMatching"[^>]*checked=""/);
    for (const form of forms(html, "updateModifierFormAction")) expect(form).toContain('value="1,25"');
    exportVisualFixture("modifiers", html);
  });
  it("keeps product changes, advanced values and group links in independently targeted forms", async () => {
    const html = renderToStaticMarkup(await EditProductPage({ params: Promise.resolve({ id: "product-a" }) }));
    idsAreUnique(html);
    const [product] = forms(html, "updateProductFormAction");
    const [link] = forms(html, "linkModifierGroupAction");
    expect(product).toContain('name="productId" value="product-a"');
    expect(product).toContain('value="19,90"');
    expect(product).toContain('value="TEST"');
    expect(product).not.toContain('name="modifierGroupId"');
    expect(link).toContain('name="productId" value="product-a"');
    expect(link).toContain('name="sortOrder"');
    expect(link).not.toContain('name="price"');
    expect(forms(html, "unlinkModifierGroupAction")[0]).toContain('name="modifierGroupId" value="group-a"');
    exportVisualFixture("product-edit", html);
  });
  it("retains the new-product fields and default availability", async () => {
    const html = renderToStaticMarkup(await NewProductPage());
    idsAreUnique(html);
    const [form] = forms(html, "createProductFormAction");
    expect(form).toContain('value="available" selected=""');
    for (const name of ["name", "description", "categoryId", "price", "promotionalPrice", "cost", "sku", "barcode", "imageFile", "availability", "active"]) expect(form).toContain(`name="${name}"`);
    exportVisualFixture("product-new", html);
  });
});
