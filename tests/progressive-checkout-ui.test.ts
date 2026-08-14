import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const page = readFileSync("src/app/m/[slug]/checkout/page.tsx", "utf8");
const styles = readFileSync("src/app/m/[slug]/checkout/checkout.module.css", "utf8");
describe("progressive checkout UI", () => {
  it("keeps the intended checkout sequence", () => { for (const label of ["Quem está pedindo?", "Como você quer receber?", "Onde devemos entregar?", "Como você vai pagar?", "Revise e confirme"]) expect(page).toContain(label); });
  it("asks for address only after delivery is selected", () => { expect(page).toContain('const deliverySelected = session?.fulfillment_type === "delivery"'); expect(page).toContain("{deliverySelected ? <section"); });
  it("preserves every server action in the flow", () => { for (const action of ["saveCheckoutIdentityAction", "saveCheckoutFulfillmentAction", "saveCheckoutAddressAction", "saveCheckoutPaymentAction", "reviewCheckoutAction", "createOrderFromCheckoutAction"]) expect(page).toContain(action); });
  it("keeps benefits optional instead of blocking the primary flow", () => { expect(page).toContain("Benefícios opcionais"); expect(page).toContain("<details"); });
  it("has responsive step and form layouts", () => { expect(styles).toContain("@media(max-width:720px)"); expect(styles).toContain("@media(max-width:480px)"); expect(styles).toContain("grid-template-columns:1fr"); });
});
