import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/app/m/[slug]/checkout/page.tsx", "utf8");
const actions = readFileSync("src/features/checkout/actions.ts", "utf8");
const service = readFileSync("src/server/checkout/checkout-service.ts", "utf8");
const styles = readFileSync("src/app/m/[slug]/checkout/checkout.module.css", "utf8");

describe("progressive checkout UI", () => {
  it("keeps the approved customer-facing checkout sequence", () => {
    const receiving = page.indexOf('title="Como vai receber?"');
    const address = page.indexOf('title="Onde entregar?"');
    const identity = page.indexOf('title="Seus dados"');
    const payment = page.indexOf('title="Pagamento"');
    const review = page.indexOf("Confira seu pedido");
    expect(receiving).toBeGreaterThan(-1);
    expect(address).toBeGreaterThan(receiving);
    expect(identity).toBeGreaterThan(address);
    expect(payment).toBeGreaterThan(identity);
    expect(review).toBeGreaterThan(payment);
  });

  it("shows address only for delivery while identity stays available after receiving choice", () => {
    expect(page).toContain('const deliverySelected = session?.fulfillment_type === "delivery"');
    expect(page).toContain("{fulfillmentComplete && deliverySelected ? (");
    expect(page).toContain("{fulfillmentComplete ? (");
    expect(page).toContain("{identityComplete && fulfillmentComplete && addressComplete ? (");
    expect(page).toContain("{paymentComplete ? (");
  });

  it("preserves the server actions wired by the current checkout", () => {
    for (const action of [
      "saveCheckoutIdentityAction",
      "saveCheckoutFulfillmentAction",
      "saveCheckoutAddressAction",
      "saveCheckoutPaymentAction",
      "useSavedCheckoutAddressAction",
      "reviewCheckoutAction",
      "createOrderFromCheckoutAction",
    ]) expect(page).toContain(action);
    expect(actions).toContain("saveCheckoutScheduleAction");
    expect(service).toContain("static async saveSchedule");
  });

  it("keeps benefits optional without blocking the primary flow", () => {
    expect(page).toContain("Tenho cupom, cashback ou pontos");
    expect(page).toContain("<details className={styles.optional}");
    expect(page).toContain("applyCheckoutBenefitsAction");
  });

  it("collapses completed steps while allowing targeted error reopening", () => {
    expect(page).toContain("open={forceOpen || !complete}");
    expect(page).toContain('forceOpen={query.erro === "pix_email_required"}');
    expect(page).toContain('complete ? <span className={styles.edit}>Editar</span> : null');
  });

  it("keeps total and primary completion action prominent", () => {
    expect(page).toContain("Confirmar pedido ·");
    expect(page).toContain("styles.stickySummary");
    expect(styles).toContain("position:fixed");
  });

  it("has responsive step and form layouts", () => {
    expect(styles).toContain("@media(max-width:720px)");
    expect(styles).toContain("@media(max-width:480px)");
    expect(styles).toContain("grid-template-columns:1fr");
  });
});