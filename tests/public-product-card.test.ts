import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const card = readFileSync("src/features/menu/public-product-card.tsx", "utf8");
const fallback = readFileSync("src/features/menu/product-image-fallback.tsx", "utf8");
const styles = readFileSync("src/features/menu/menu-browser.module.css", "utf8");
const actions = readFileSync("src/features/cart/actions.ts", "utf8");
describe("public product card (Expresso)", () => {
  it("shows name, price, promotion and sold-out state", () => { expect(card).toContain("product.name"); expect(card).toContain("promotional_price_cents"); expect(card).toContain("Esgotado"); expect(card).toContain('"Oferta"'); });
  it("only adds directly when the product has no options and the store can take orders", () => {
    expect(card).toContain("const quick = allowQuickAdd && !hasOptions && !unavailable");
    expect(card).toContain("const hasOptions = options ? options.hasOptions : true");
    expect(card).toContain("Escolher opções de ${product.name}");
  });
  it("adjusts simple items from the menu and returns to the same item", () => {
    expect(card).toContain('name="returnTo" value="menu"');
    expect(card).toContain("updateCartQuantityAction");
    expect(card).toContain("removeCartItemAction");
    expect(actions).toContain('if (formData.get("returnTo") !== "menu") return null');
    expect(actions).toContain("#produto-${productId}");
  });
  it("shows a starting price when required options add cost", () => { expect(card).toContain("a partir de"); expect(card).toContain("minimumRequiredExtraCents"); });
  it("keeps image geometry and text density controlled", () => { expect(styles).toContain("aspect-ratio:1"); expect(styles).toContain("-webkit-line-clamp:2"); expect(styles).toContain("object-fit:cover"); });
  it("uses a drawn placeholder instead of text or a fake brand mark", () => { expect(card).not.toContain("Sem foto"); expect(fallback).toContain("aria-hidden"); expect(card).not.toContain('>P<'); });
});
