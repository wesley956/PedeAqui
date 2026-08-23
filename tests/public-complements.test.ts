import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/sql/135_public_complement_categories.sql", "utf8");
const service = readFileSync("src/server/menu/complement-category-service.ts", "utf8");
const actions = readFileSync("src/features/menu/complement-actions.ts", "utf8");
const productPage = readFileSync("src/app/m/[slug]/produto/[id]/page.tsx", "utf8");
const section = readFileSync("src/features/menu/complement-category-section.tsx", "utf8");
const selector = readFileSync("src/features/menu/modifier-group-selector.tsx", "utf8");

describe("public complementary categories", () => {
  it("stores configuration by authoritative store/category ids", () => {
    expect(migration).toContain("store_complement_categories");
    expect(migration).toContain("enforce_complement_category_scope");
    expect(migration).toContain("c.organization_id = new.organization_id");
    expect(migration).toContain("c.store_id = new.store_id");
    expect(migration).toContain("replace_complement_categories_internal");
  });

  it("bootstraps Bebidas only for restaurants with one unambiguous category", () => {
    expect(migration).toContain("s.business_type='restaurant'");
    expect(migration).toContain("lower(trim(c.name))='bebidas'");
    expect(migration).toContain("1=(select count(*)");
    expect(service).toContain('store.business_type === "restaurant"');
    expect(service).toContain('normalized(category.name) === "bebidas"');
  });

  it("keeps public suggestions store scoped and eligible", () => {
    expect(service).toContain('.eq("organization_id", store.organization_id).eq("store_id", store.id)');
    expect(service).toContain('.eq("active", true).eq("availability", "available")');
    expect(service).toContain("slice(0, previewLimit)");
  });

  it("uses the official cart for simple complements and server-side pricing", () => {
    expect(actions).toContain("CartService.addItem");
    expect(actions).toContain("modifierSelections: []");
    expect(actions).not.toContain("priceCents:");
  });

  it("renders complements inside the product journey without making them mandatory", () => {
    expect(productPage).toContain("ComplementCategoryService.loadPublic");
    expect(productPage).toContain("Cross-sell is optional merchandising");
    expect(productPage).toContain("<ComplementCategorySection");
    expect(section).toContain("Opcional. Você pode adicionar agora ou seguir sem complemento.");
    expect(section).toContain('id="complementos"');
  });

  it("preserves the main form while adding or configuring complements", () => {
    expect(section).toContain("addSimpleComplementAction");
    expect(section).toContain('target="_blank"');
    expect(section).toContain("para preservar a montagem atual");
  });

  it("offers reduced-motion-aware assisted scrolling after a valid quantity selection", () => {
    expect(selector).toContain("prefers-reduced-motion: reduce");
    expect(selector).toContain("Pronto, ver complementos →");
    expect(selector).toContain("complementTargetId && complete");
  });
});
