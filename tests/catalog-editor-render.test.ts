import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import CategoriesPage from "@/app/(app)/cardapio/categorias/page";
import ModifiersPage from "@/app/(app)/cardapio/adicionais/page";
import EditProductPage from "@/app/(app)/cardapio/produtos/[id]/page";
import NewProductPage from "@/app/(app)/cardapio/produtos/novo/page";
import PromotionsPage from "@/app/(app)/cardapio/promocoes/page";
import ComplementSettingsPage from "@/app/(app)/cardapio/sugestoes/page";
import catalogStyles from "@/app/(app)/cardapio/catalog-management.module.css";
import editorStyles from "@/app/(app)/cardapio/produtos/novo/product-editor.module.css";
import controlStyles from "@/components/ui/form-controls.module.css";
import imageStyles from "@/components/media/image-upload-field.module.css";
import buttonStyles from "@/components/ui/button.module.css";
import statusStyles from "@/components/ui/status.module.css";

const fixtures = vi.hoisted(() => ({
  empty: false,
  categories: ["cat-a", "cat-b"].map((id) => ({ id, name: `Categoria ${id}`, sort_order: 2, description: "Descrição da categoria", active: true, image_url: null })),
  groups: ["group-a", "group-b"].map((id) => ({ id, name: `Sabores ${id}`, description: "Escolha seus sabores", selection_mode: "equal_split_options", distribution_total: 50, min_selection: 1, max_selection: 2, sort_order: 3, active: true, required: true })),
  modifiers: ["option-a", "option-b"].map((id, i) => ({ id, modifier_group_id: i ? "group-b" : "group-a", name: `Opção ${id}`, price_cents: 125, sort_order: 4, active: true })),
  products: ["product-a", "product-b"].map((id) => ({ id, name: `Produto de teste com nome longo ${id}`, price_cents: 1990, active: true, availability: "available" })),
  suggestions: [
    { id: "11111111-1111-4111-8111-111111111111", name: "Salgados", active: true, selected: false, sortOrder: 1, suggestedDefault: false },
    { id: "22222222-2222-4222-8222-222222222222", name: "Churros", active: true, selected: true, sortOrder: 2, suggestedDefault: false },
    { id: "33333333-3333-4333-8333-333333333333", name: "Categoria inativa", active: false, selected: false, sortOrder: 3, suggestedDefault: false },
  ],
}));

vi.mock("@/server/catalog/category-service", () => ({ CategoryService: { list: vi.fn(async () => fixtures.categories) } }));
vi.mock("@/server/catalog/modifier-service", () => ({ ModifierService: { listGroups: vi.fn(async () => fixtures.groups), listModifiers: vi.fn(async () => fixtures.modifiers), listProductGroupLinks: vi.fn(async () => [{ modifier_group_id: "group-a", sort_order: 7 }]) } }));
vi.mock("@/server/catalog/product-service", () => ({ ProductService: { list: vi.fn(async () => fixtures.empty ? [] : fixtures.products), get: vi.fn(async () => ({ id: "product-a", name: "Produto de teste", description: "Descrição", price_cents: 1990, promotional_price_cents: null, cost_cents: 800, category_id: "cat-a", image_url: null, availability: "available", active: true, preparation_time_minutes: 10, sort_order: 5, sku: "TEST", barcode: "123" })) } }));
vi.mock("@/server/promotions/promotion-service", () => ({ PromotionService: { list: vi.fn(async () => fixtures.empty ? [] : fixtures.products.map((product, i) => ({ id: `promo-${i}`, product_id: product.id, promotion_group_id: "campaign-a", campaign_name: "Campanha de teste", label: "Oferta", active: true, weekdays: [1, 5], starts_at: "10:00:00", ends_at: "22:00:00", starts_on: "2026-10-01", ends_on: null, promotional_price_cents: 1500 }))) } }));
vi.mock("@/server/menu/complement-category-service", () => ({ ComplementCategoryService: { loadAdminSettings: vi.fn(async () => ({ businessType: "restaurant", categories: fixtures.empty ? [] : fixtures.suggestions, rules: fixtures.empty ? [] : [{ sourceCategoryId: fixtures.suggestions[0]!.id, targetCategoryId: fixtures.suggestions[1]!.id, title: "Vai um docinho?", sortOrder: 7 }] })) } }));
vi.mock("@/features/promotions/actions", () => Object.fromEntries(["savePromotionAction", "removePromotionAction"].map((name) => [name, Object.assign(async () => ({ ok: true, message: "Salvo" }), { actionName: name })])));
vi.mock("@/features/menu/complement-actions", () => Object.fromEntries(["saveComplementCategoriesAction", "saveComplementCategoryRulesAction"].map((name) => [name, Object.assign(async () => ({ ok: true, message: "Salvo" }), { actionName: name })])));
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
    ["src/components/ui/status.module.css", statusStyles],
  ];
  const css = readFileSync("src/app/globals.css", "utf8") + sources.map(([path, mapping]) => readFileSync(path, "utf8").replace(/\.([a-zA-Z_][\w-]*)/g, (token, key: string) => mapping[key] ? `.${mapping[key]}` : token)).join("\n");
  mkdirSync(process.env.PEDEAQUI_EDITOR_QA_DIR, { recursive: true });
  writeFileSync(`${process.env.PEDEAQUI_EDITOR_QA_DIR}/${name}.html`, `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}body{margin:0;padding:16px}main{max-width:1100px;margin:auto}</style><main>${html}</main></html>`);
}

describe("catalog editors preserve independent payloads and accessible repeated controls", () => {
  afterEach(() => { fixtures.empty = false; });
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
    const html = renderToStaticMarkup(await ModifiersPage({ searchParams: Promise.resolve({}) }));
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
    // Cada opção tem o interruptor (todos os grupos) e a ação "só neste grupo" no menu.
    expect(availability).toHaveLength(4);
    expect(availability.filter((form) => /name="allMatching" value="on"/.test(form))).toHaveLength(2);
    expect(availability.filter((form) => /name="allMatching" value="off"/.test(form))).toHaveLength(2);
    for (const form of forms(html, "updateModifierFormAction")) expect(form).toContain('value="1,25"');
    exportVisualFixture("modifiers", html);
  });
  it("finds a flavor by name and opens only the groups that contain it", async () => {
    const html = renderToStaticMarkup(await ModifiersPage({ searchParams: Promise.resolve({ q: "option-b" }) }));
    expect(html).toContain("Opção option-b");
    expect(html).not.toContain("Opção option-a");
    expect(forms(html, "updateModifierGroupFormAction")).toHaveLength(1);
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
  it("preserves individual promotional schedules and campaign-scoped removal", async () => {
    const html = renderToStaticMarkup(await PromotionsPage());
    idsAreUnique(html);
    const [form] = forms(html, "savePromotionAction");
    expect(form).toBeDefined();
    for (const product of fixtures.products) {
      expect(form).toContain(`name="productId" value="${product.id}"`);
      for (const prefix of ["price", "weekday", "startsOn", "endsOn", "startsAt", "endsAt"]) expect(form).toContain(`name="${prefix}_${product.id}"`);
    }
    expect(form).toMatch(/name="active"[^>]*checked=""/);
    expect(forms(html, "removePromotionAction")).toHaveLength(1);
    expect(forms(html, "removePromotionAction")[0]).toContain('name="promotionGroupId" value="campaign-a"');
    expect(html).toContain("Seg, Sex");
    expect(html).toContain("10:00 – 22:00");
    exportVisualFixture("promotions", html);
  });
  it("separates source rules from general suggestions and retains custom titles and disabled categories", async () => {
    const html = renderToStaticMarkup(await ComplementSettingsPage({ searchParams: Promise.resolve({ source: fixtures.suggestions[0]!.id }) }));
    idsAreUnique(html);
    const [rule] = forms(html, "saveComplementCategoryRulesAction");
    const [general] = forms(html, "saveComplementCategoriesAction");
    expect(rule).toContain(`name="sourceCategoryId" value="${fixtures.suggestions[0]!.id}"`);
    expect(rule).toContain('value="Vai um docinho?"');
    expect(rule).not.toContain('name="categoryId"');
    expect(general).not.toContain('name="sourceCategoryId"');
    expect(general).toMatch(/name="categoryId"[^>]*checked=""/);
    expect(rule).toMatch(/<input(?=[^>]*name="targetCategoryId")(?=[^>]*disabled="")[^>]*>/);
    expect(html).toContain('method="get"');
    exportVisualFixture("suggestions", html);
  });
  it("handles empty catalogs without enabling invalid create/save actions", async () => {
    fixtures.empty = true;
    const promotion = renderToStaticMarkup(await PromotionsPage());
    expect(promotion).toContain("Cadastre e ative um produto");
    expect(promotion).toMatch(/<button[^>]*disabled=""[^>]*>Criar promoção/);
    const suggestions = renderToStaticMarkup(await ComplementSettingsPage({ searchParams: Promise.resolve({ source: "invalid" }) }));
    expect(forms(suggestions, "saveComplementCategoryRulesAction")).toHaveLength(0);
    expect(suggestions).toMatch(/<button[^>]*disabled=""[^>]*>Salvar sugestões gerais/);
  });
});
