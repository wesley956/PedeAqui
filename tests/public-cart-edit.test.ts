import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync("supabase/sql/138_public_cart_atomic_item_replace.sql", "utf8");
const service = readFileSync("src/server/cart/cart-item-edit-service.ts", "utf8");
const actions = readFileSync("src/features/cart/actions.ts", "utf8");
const productPage = readFileSync("src/app/m/[slug]/produto/[id]/page.tsx", "utf8");
const selector = readFileSync("src/features/menu/modifier-group-selector.tsx", "utf8");
const cartPage = readFileSync("src/app/m/[slug]/carrinho/page.tsx", "utf8");

describe("public cart item editing", () => {
  it("replaces only an item owned by the same active cart and product", () => {
    expect(migration).toContain("p_existing_item_id");
    expect(migration).toContain("c.token_hash = p_token_hash");
    expect(migration).toContain("c.organization_id = p_organization_id");
    expect(migration).toContain("c.store_id = p_store_id");
    expect(migration).toContain("v_existing_product_id <> p_product_id");
  });

  it("performs replacement atomically after the new authoritative line succeeds", () => {
    expect(migration).toContain("public.cart_add_item_internal");
    expect(migration).toContain("public.cart_add_gas_item_internal");
    expect(migration.indexOf("v_new_item_id :=")).toBeLessThan(migration.indexOf("delete from public.cart_items"));
    expect(migration).toContain("replaced_item_id");
  });

  it("re-prices edited products on the server and never accepts browser price", () => {
    expect(service).toContain("PricingService.priceItem");
    expect(service).toContain("PublicMenuService.getProduct");
    expect(service).toContain("priced.baseUnitPriceCents");
    expect(actions).not.toContain("priceCents:");
  });

  it("prefills legacy and quantity-per-option selections from the current cart item", () => {
    expect(productPage).toContain("initialSelections[modifier.modifier_id]");
    expect(productPage).toContain("initialSelections={initialSelections}");
    expect(selector).toContain("initialSelections[modifier.id]");
    expect(selector).toContain("useState<Record<string, number>>");
  });

  it("preserves note, product quantity and gas mode during edit", () => {
    expect(productPage).toContain("editNote = item.note");
    expect(productPage).toContain("editQuantity = Number(item.quantity");
    expect(productPage).toContain("editGasSaleMode = item.gas?.sale_mode");
    expect(productPage).toContain("Salvar alterações");
  });

  it("routes edit from the official product page and keeps the old row on cancel", () => {
    expect(cartPage).toContain("?editar=${item.id}");
    expect(productPage).toContain("Se você voltar sem salvar, a montagem atual do carrinho permanece intacta");
    expect(actions).toContain("CartItemEditService.replaceItem");
  });
});
