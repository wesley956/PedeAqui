import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/app/m/[slug]/checkout/page.tsx", "utf8");
const actions = readFileSync("src/features/checkout/actions.ts", "utf8");
const confirmAction = readFileSync("src/features/checkout/confirm-order-action.ts", "utf8");
const service = readFileSync("src/server/checkout/checkout-service.ts", "utf8");
const orderService = readFileSync("src/server/orders/order-service.ts", "utf8");
const styles = readFileSync("src/app/m/[slug]/checkout/checkout.module.css", "utf8");

describe("progressive checkout UI", () => {
  it("keeps the approved customer-facing checkout sequence", () => {
    const receiving = page.indexOf('title="Como vai receber?"');
    const identity = page.indexOf('title="Seus dados"');
    const address = page.indexOf('title="Onde entregar?"');
    const payment = page.indexOf('title="Pagamento"');
    const review = page.indexOf("Revisar e confirmar");
    expect(receiving).toBeGreaterThan(-1);
    expect(identity).toBeGreaterThan(receiving);
    expect(address).toBeGreaterThan(identity);
    expect(payment).toBeGreaterThan(address);
    expect(review).toBeGreaterThan(payment);
  });

  it("derives delivery and pickup stages from the persisted server state", () => {
    expect(page).toContain('const deliverySelected = session?.fulfillment_type === "delivery"');
    expect(page).toContain('["fulfillment", "identity", "address", "payment", "review"]');
    expect(page).toContain('["fulfillment", "identity", "payment", "review"]');
    expect(page).toContain('activeStage === "address" && fulfillmentComplete && identityComplete && deliverySelected');
    expect(page).toContain('activeStage === "payment" && identityComplete && fulfillmentComplete && addressComplete');
    expect(page).toContain('activeStage === "review" && paymentComplete');
  });

  it("preserves checkout actions and uses one final confirmation action", () => {
    for (const action of [
      "saveCheckoutIdentityAction",
      "saveCheckoutFulfillmentAction",
      "saveCheckoutAddressAction",
      "saveCheckoutPaymentAction",
      "useSavedCheckoutAddressAction",
      "confirmCheckoutOrderAction",
    ]) expect(page).toContain(action);
    expect(actions).toContain("saveCheckoutScheduleAction");
    expect(service).toContain("static async saveSchedule");
    expect(confirmAction).toContain("createOrderFromCheckoutAction");
    expect(orderService).toContain("CheckoutService.review(storeSlug, token)");
    expect(page).not.toContain("Conferir pedido");
    expect(page).not.toContain("Pendente de revisão");
  });

  it("keeps benefits optional and module-gated", () => {
    expect(page).toContain("Tenho cupom, cashback ou pontos");
    expect(page).toContain("paymentComplete && growthEnabled && benefits");
    expect(page).toContain("applyCheckoutBenefitsAction");
    expect(service).toContain('StoreModuleStateService.isEnabled(cartResult.store.organization_id, cartResult.store.id, "growth")');
  });

  it("restores the active stage from persisted completion and targeted errors", () => {
    expect(page).toContain("const firstIncomplete: CheckoutStageId");
    expect(page).toContain("const errorStage:");
    expect(page).toContain('pix_email_required: "identity"');
    expect(page).toContain('neighborhood_not_served: "address"');
    expect(page).toContain("const validErrorStage: CheckoutStageId | null");
    expect(page).toContain("requestedStage && requestedAllowed");
  });

  it("keeps one prominent final completion action with the authoritative total", () => {
    expect(page).toContain("Confirmar pedido ·");
    expect(page).toContain("styles.footer");
    expect(page).toContain("cart.total_cents");
    expect(styles).toContain("grid-template-rows:auto auto minmax(0,1fr) auto");
  });

  it("uses a fullscreen responsive shell with safe overflow fallback", () => {
    expect(styles).toContain("height:100dvh");
    expect(styles).toContain("overflow-y:auto");
    expect(styles).toContain("@media(max-width:720px)");
    expect(styles).toContain("@media(max-width:480px)");
    expect(styles).toContain("grid-template-columns:1fr");
  });
});
