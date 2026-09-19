import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/sql/135_public_complement_categories.sql", "utf8");
const security = readFileSync("supabase/sql/136_public_complement_categories_security.sql", "utf8");
const chainMigration = readFileSync("supabase/sql/220_configurable_cross_sell_chains.sql", "utf8");
const versionedChainMigration = readFileSync("supabase/migrations/20260919203000_configurable_cross_sell_chains.sql", "utf8");
const service = readFileSync("src/server/menu/complement-category-service.ts", "utf8");
const actions = readFileSync("src/features/menu/complement-actions.ts", "utf8");
const settingsPage = readFileSync("src/app/(app)/cardapio/sugestoes/page.tsx", "utf8");
const productPage = readFileSync("src/app/m/[slug]/produto/[id]/page.tsx", "utf8");
const section = readFileSync("src/features/menu/complement-category-section.tsx", "utf8");
const selector = readFileSync("src/features/menu/modifier-group-selector.tsx", "utf8");

describe("public complementary categories", () => {
  it("stores global configuration by authoritative store/category ids", () => {
    expect(migration).toContain("store_complement_categories");
    expect(migration).toContain("enforce_complement_category_scope");
    expect(migration).toContain("c.organization_id = new.organization_id");
    expect(migration).toContain("c.store_id = new.store_id");
    expect(migration).toContain("replace_complement_categories_internal");
  });

  it("denies direct browser access even though the service role can manage global configuration", () => {
    expect(migration).toContain("revoke all on table public.store_complement_categories from anon, authenticated");
    expect(security).toContain("store_complement_categories_deny_direct");
    expect(security).toContain("to anon, authenticated");
    expect(security).toContain("using (false)");
    expect(security).toContain("with check (false)");
  });

  it("bootstraps Bebidas only for restaurants with one unambiguous category", () => {
    expect(migration).toContain("s.business_type='restaurant'");
    expect(migration).toContain("lower(trim(c.name))='bebidas'");
    expect(migration).toContain("1=(select count(*)");
    expect(service).toContain('store.business_type === "restaurant"');
    expect(service).toContain('normalized(category.name) === "bebidas"');
  });

  it("adds source-specific cross-sell rules without weakening store isolation", () => {
    expect(chainMigration).toContain("store_complement_category_rules");
    expect(chainMigration).toContain("source_category_id uuid not null");
    expect(chainMigration).toContain("target_category_id uuid not null");
    expect(chainMigration).toContain("source_category_id <> target_category_id");
    expect(chainMigration).toContain("enforce_complement_category_rule_scope");
    expect(chainMigration).toContain("replace_complement_category_rules_internal");
    expect(chainMigration).toContain("store_complement_category_rules_deny_direct");
    expect(chainMigration).toContain("to service_role");
    expect(versionedChainMigration).toBe(chainMigration);
  });

  it("supports custom titles and deterministic target ordering", () => {
    expect(chainMigration).toContain("char_length(trim(title)) between 1 and 80");
    expect(chainMigration).toContain("sort_order between 0 and 10000");
    expect(service).toContain('.eq("source_category_id", sourceCategoryId)');
    expect(service).toContain('.order("sort_order")');
    expect(service).toContain("title: config.title");
    expect(section).toContain("category.title?.trim()");
  });

  it("keeps global settings as a compatibility fallback when a source has no rule", () => {
    expect(service).toContain("source-specific rules win");
    expect(service).toContain('admin.from("store_complement_categories")');
    expect(settingsPage).toContain("Sugestões globais (fallback)");
    expect(settingsPage).toContain("regra específica");
  });

  it("keeps public suggestions store scoped and eligible", () => {
    expect(service).toContain('.eq("organization_id", store.organization_id).eq("store_id", store.id)');
    expect(service).toContain('.eq("active", true).eq("availability", "available")');
    expect(service).toContain("slice(0, previewLimit)");
  });

  it("lets the merchant configure source, target, custom title and order", () => {
    expect(settingsPage).toContain('name="source"');
    expect(settingsPage).toContain('name="sourceCategoryId"');
    expect(settingsPage).toContain('name="targetCategoryId"');
    expect(settingsPage).toContain("rule_title_");
    expect(settingsPage).toContain("rule_order_");
    expect(settingsPage).toContain("Vai um docinho?");
    expect(actions).toContain("saveComplementCategoryRulesAction");
    expect(actions).toContain("ComplementCategoryService.replaceRules");
  });

  it("uses the official cart for simple complements and validates against the active source chain", () => {
    expect(actions).toContain("CartService.addItem");
    expect(actions).toContain("modifierSelections: []");
    expect(actions).toContain("loadPublic(storeSlug, sourceProductId, 12)");
    expect(actions).not.toContain("priceCents:");
    expect(section).toContain("categories[0]?.sourceProductId");
  });

  it("blocks duplicate UI submissions while a complement request is in flight", () => {
    expect(section).toContain("useRef(new Set<string>())");
    expect(section).toContain("inFlight.current.has(productId)");
    expect(section).toContain("inFlight.current.add(productId)");
    expect(section).toContain("inFlight.current.delete(productId)");
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
