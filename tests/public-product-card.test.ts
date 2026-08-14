import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const card = readFileSync("src/features/menu/public-product-card.tsx", "utf8");
const styles = readFileSync("src/features/menu/menu-browser.module.css", "utf8");
describe("public product card", () => {
  it("shows name, price, promotion and sold-out state", () => { expect(card).toContain("product.name"); expect(card).toContain("promotional_price_cents"); expect(card).toContain("ESGOTADO"); expect(card).toContain("OFERTA"); });
  it("does not suggest adding a sold-out item", () => { expect(card).toContain("Indisponível para adicionar"); expect(card).toContain("Ver opções →"); });
  it("keeps image geometry and text density controlled", () => { expect(styles).toContain("aspect-ratio:1"); expect(styles).toContain("-webkit-line-clamp:2"); expect(styles).toContain("object-fit:cover"); });
  it("uses a meaningful placeholder instead of a fake brand mark", () => { expect(card).toContain("Sem foto"); expect(card).not.toContain('>P<'); });
});
