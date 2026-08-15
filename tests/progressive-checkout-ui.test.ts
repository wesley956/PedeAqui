import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/app/m/[slug]/checkout/page.tsx", "utf8");
const styles = readFileSync("src/app/m/[slug]/checkout/checkout.module.css", "utf8");

describe("progressive checkout UI", () => {
  it("keeps the intended customer-facing checkout sequence", () => {
    for (const label of ["Seus dados", "Como quer receber?", "Endereço de entrega", "Pagamento", "Confira seu pedido"]) {
      expect(page).toContain(label);
    }
  });

  it("reveals downstream steps only when the previous information is complete", () => {
    expect(page).toContain('const deliverySelected = session?.fulfillment_type === "delivery"');
    expect(page).toContain("{identityComplete ? (");
    expect(page).toContain("{identityComplete && fulfillmentComplete && deliverySelected ? (");
    expect(page).toContain("{identityComplete && fulfillmentComplete && addressComplete ? (");
    expect(page).toContain("{paymentComplete ? (");
  });

  it("preserves every server action in the flow", () => {
    for (const action of [
      "saveCheckoutIdentityAction",
      "saveCheckoutFulfillmentAction",
      "saveCheckoutAddressAction",
      "saveCheckoutPaymentAction",
      "reviewCheckoutAction",
      "createOrderFromCheckoutAction",
    ]) expect(page).toContain(action);
  });

  it("keeps benefits optional instead of blocking the primary flow", () => {
    expect(page).toContain("Tenho cupom, cashback ou pontos");
    expect(page).toContain("<details className={styles.optional}");
  });

  it("collapses completed steps while keeping them editable", () => {
    expect(page).toContain("open={!complete}");
    expect(page).toContain('complete ? <span className={styles.edit}>Editar</span> : null');
  });

  it("keeps total and primary completion action prominent", () => {
    expect(page).toContain("Fazer pedido ·");
    expect(page).toContain("styles.stickySummary");
    expect(styles).toContain("position:fixed");
  });

  it("has responsive step and form layouts", () => {
    expect(styles).toContain("@media(max-width:720px)");
    expect(styles).toContain("@media(max-width:480px)");
    expect(styles).toContain("grid-template-columns:1fr");
  });
});
