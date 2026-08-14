import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const page = readFileSync("src/app/m/[slug]/carrinho/page.tsx", "utf8");
const styles = readFileSync("src/app/m/[slug]/carrinho/cart.module.css", "utf8");
describe("public cart UI", () => {
  it("keeps quantity and removal on authoritative server actions", () => { expect(page).toContain("updateCartQuantityAction"); expect(page).toContain("removeCartItemAction"); expect(page).not.toContain("supabase"); });
  it("shows note, modifiers and server-derived totals", () => { expect(page).toContain("item.note"); expect(page).toContain("item.modifiers"); expect(page).toContain("cart.subtotal_cents"); expect(page).toContain("cart.discount_cents"); expect(page).toContain("cart.delivery_fee_cents"); expect(page).toContain("cart.total_cents"); });
  it("blocks checkout when an item is invalid", () => { expect(page).toContain("invalidCount > 0"); expect(page).toContain("Remova ou refaça"); });
  it("keeps cart controls touch friendly on mobile", () => { expect(styles).toContain("@media(max-width:640px)"); expect(styles).toContain("min-height:var(--control-height-lg)"); });
});
