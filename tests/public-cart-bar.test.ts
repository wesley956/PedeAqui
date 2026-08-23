import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const component = readFileSync("src/features/cart/public-cart-bar.tsx", "utf8");
const styles = readFileSync("src/features/cart/public-cart-bar.module.css", "utf8");
const summary = readFileSync("src/server/cart/public-cart-summary-service.ts", "utf8");
const menuPage = readFileSync("src/app/m/[slug]/page.tsx", "utf8");
const productPage = readFileSync("src/app/m/[slug]/produto/[id]/page.tsx", "utf8");

describe("persistent public cart bar", () => {
  it("reads the authoritative cart token scoped to the current slug", () => {
    expect(component).toContain("cartCookieName(storeSlug)");
    expect(component).toContain("PublicCartSummaryService.get(storeSlug, token)");
    expect(summary).toContain('.eq("organization_id", store.organization_id)');
    expect(summary).toContain('.eq("store_id", store.id)');
    expect(summary).toContain('.eq("token_hash", hashCartToken(token))');
  });

  it("stays hidden for missing or empty carts", () => {
    expect(component).toContain("if (!summary) return null");
    expect(summary).toContain("if (itemCount === 0) return null");
  });

  it("uses server-persisted quantity and total instead of browser pricing", () => {
    expect(summary).toContain('.select("id, subtotal_cents, total_cents, updated_at")');
    expect(summary).toContain('.select("quantity")');
    expect(component).toContain("summary.totalCents");
    expect(component).not.toContain("localStorage");
  });

  it("is present on menu and product without replacing the product add CTA", () => {
    expect(menuPage).toContain("<PublicCartBar");
    expect(productPage).toContain("<PublicCartBar");
    expect(productPage).toContain("Adicionar ao carrinho");
  });

  it("reserves space, supports safe areas and remains keyboard accessible", () => {
    expect(styles).toContain("env(safe-area-inset-bottom)");
    expect(styles).toContain(".spacer");
    expect(styles).toContain(":focus-visible");
    expect(component).toContain("aria-label={`Carrinho:");
  });
});
