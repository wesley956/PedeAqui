import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const page = readFileSync("src/app/m/[slug]/carrinho/page.tsx", "utf8");
const styles = readFileSync("src/app/m/[slug]/carrinho/cart.module.css", "utf8");
describe("public cart UI", () => {
  it("keeps quantity and removal on authoritative server actions", () => { expect(page).toContain("updateCartQuantityAction"); expect(page).toContain("removeCartItemAction"); expect(page).not.toContain("supabase"); });
  it("shows note, modifiers, gas context and server-derived totals", () => { expect(page).toContain("item.note"); expect(page).toContain("item.modifiers"); expect(page).toContain("item.gas"); expect(page).toContain("cart.subtotal_cents"); expect(page).toContain("cart.discount_cents"); expect(page).toContain("cart.delivery_fee_cents"); expect(page).toContain("cart.total_cents"); });
  it("blocks checkout when an item is invalid", () => { expect(page).toContain("invalidCount > 0"); expect(page).toContain("Edite ou remova"); expect(page).toContain("Corrija o carrinho para continuar"); });
  it("uses direct product quantity steppers without mixing flavor quantities", () => { expect(page).toContain('aria-label={`Quantidade de ${item.product_name_snapshot}`}'); expect(page).toContain("Math.max(1, Number(item.quantity) - 1)"); expect(page).toContain("Math.min(99, Number(item.quantity) + 1)"); });
  it("keeps the mobile checkout action visible without covering content", () => { expect(styles).toContain("@media(max-width:640px)"); expect(styles).toContain(".checkoutDock{position:fixed"); expect(styles).toContain("env(safe-area-inset-bottom)"); });
});
