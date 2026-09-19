import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/sql/221_catalog_category_duplication.sql", "utf8");
const versionedMigration = readFileSync("supabase/migrations/20260919231000_catalog_category_duplication.sql", "utf8");
const service = readFileSync("src/server/catalog/category-service.ts", "utf8");
const action = readFileSync("src/features/catalog/category-duplication-actions.ts", "utf8");
const page = readFileSync("src/app/(app)/cardapio/categorias/page.tsx", "utf8");

describe("catalog category duplication", () => {
  it("keeps the canonical and versioned database contracts identical", () => {
    expect(versionedMigration).toBe(migration);
  });

  it("duplicates only inside the authorized tenant and store in one database transaction", () => {
    expect(migration).toContain("duplicate_catalog_category_internal");
    expect(migration).toContain("p_organization_id uuid");
    expect(migration).toContain("p_store_id uuid");
    expect(migration).toContain("c.organization_id = p_organization_id");
    expect(migration).toContain("c.store_id = p_store_id");
    expect(migration).toContain("grant execute on function public.duplicate_catalog_category_internal");
    expect(migration).toContain("to service_role");
    expect(migration).toContain("from public, anon, authenticated");
  });

  it("creates copies paused so accidental duplication never publishes immediately", () => {
    expect(migration).toContain("left(v_source_category.name, 70) || ' — Cópia'");
    expect(migration).toContain("false,\n    p_actor_user_id");
    expect(migration).toContain("false,\n        'inactive'");
    expect(page).toContain("A cópia será criada pausada");
  });

  it("can copy products without duplicating unique identifiers and keeps modifier links", () => {
    expect(migration).toContain("if coalesce(p_include_products, false) then");
    expect(migration).toContain("insert into public.products");
    expect(migration).toContain("null,\n        null,\n        v_source_product.preparation_time_minutes");
    expect(migration).toContain("insert into public.product_modifier_groups");
    expect(migration).toContain("pmg.modifier_group_id");
  });

  it("does not silently promise to clone promotions, history or merchandising rules", () => {
    expect(page).toContain("Sugestões de venda, promoções e histórico não são copiados automaticamente.");
    expect(migration).not.toContain("store_complement_category_rules");
    expect(migration).not.toContain("promotion_campaign");
  });

  it("requires product-create authorization and records an auditable duplication event", () => {
    expect(service).toContain("authorize(PERMISSIONS.PRODUCTS_CREATE)");
    expect(service).toContain('admin.rpc("duplicate_catalog_category_internal"');
    expect(service).toContain('action: "category.duplicated"');
    expect(service).toContain('type: "category.duplicated"');
  });

  it("exposes a resilient merchant action with an explicit include-products option", () => {
    expect(page).toContain("Duplicar categoria");
    expect(page).toContain('name="includeProducts"');
    expect(page).toContain("Incluir os produtos desta categoria e seus vínculos de adicionais");
    expect(page).toContain("Criar cópia");
    expect(action).toContain('formData.get("includeProducts") === "on"');
    expect(action).toContain("CategoryService.duplicate");
    expect(action).toContain('revalidatePath("/cardapio/categorias")');
    expect(action).toContain('revalidatePath("/cardapio/produtos")');
  });
});
