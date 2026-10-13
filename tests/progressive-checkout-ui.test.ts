import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/app/m/[slug]/checkout/page.tsx", "utf8");
const actions = readFileSync("src/features/checkout/actions.ts", "utf8");
const confirmAction = readFileSync("src/features/checkout/confirm-order-action.ts", "utf8");
const service = readFileSync("src/server/checkout/checkout-service.ts", "utf8");
const orderService = readFileSync("src/server/orders/order-service.ts", "utf8");
const styles = readFileSync("src/app/m/[slug]/checkout/checkout.module.css", "utf8");

const form = readFileSync("src/features/checkout/express-checkout-form.tsx", "utf8");
const expressActions = readFileSync("src/features/checkout/express-actions.ts", "utf8");

// Checkout Expresso (protótipo opção 3): uma tela, blocos editáveis e um único botão de confirmar.
describe("express checkout UI", () => {
  it("keeps the approved customer-facing block order on one screen", () => {
    const items = page.indexOf("Seu pedido");
    const coupon = page.indexOf("Tenho cupom");
    const formAt = page.indexOf("<ExpressCheckoutForm");
    expect(items).toBeGreaterThan(-1);
    expect(coupon).toBeGreaterThan(items);
    expect(formAt).toBeGreaterThan(coupon);
    const receiving = form.indexOf(">Como receber</h2>");
    const identity = form.indexOf(">Seus dados</h2>");
    const address = form.indexOf(">Endereço</h2>");
    const payment = form.indexOf(">Pagamento</h2>");
    const when = form.indexOf(">Quando</h2>");
    const summary = form.indexOf(">Resumo</h2>");
    expect(receiving).toBeGreaterThan(-1);
    expect(identity).toBeGreaterThan(receiving);
    expect(address).toBeGreaterThan(identity);
    expect(payment).toBeGreaterThan(address);
    expect(when).toBeGreaterThan(payment);
    expect(summary).toBeGreaterThan(when);
  });

  it("switches delivery and pickup without a reload and keeps the server state as default", () => {
    expect(page).toContain('const deliverySelected = session?.fulfillment_type === "delivery"');
    expect(form).toContain('useState<"delivery" | "pickup">(initialMode)');
    expect(form).toContain('{mode === "delivery" ? (');
    expect(form).toContain('<input type="hidden" name="fulfillmentType" value={mode} />');
    expect(page).not.toContain("?etapa=");
  });

  it("saves every part with the existing server rules and then confirms once", () => {
    for (const call of [
      "CheckoutService.saveFulfillment",
      "CheckoutService.saveIdentity",
      "CheckoutService.saveAddress",
      "CheckoutService.useRecognizedAddress",
      "CheckoutService.savePayment",
      "CheckoutService.saveSchedule",
      "await confirmCheckoutOrderAction(formData)",
    ]) expect(expressActions).toContain(call);
    expect(form).toContain("action={submitExpressCheckoutAction}");
    expect(actions).toContain("saveCheckoutScheduleAction");
    expect(service).toContain("static async saveSchedule");
    expect(confirmAction).toContain("createOrderFromCheckoutAction");
    expect(orderService).toContain("CheckoutService.review(storeSlug, token)");
    expect(page).not.toContain("Conferir pedido");
    expect(page).not.toContain("Pendente de revisão");
  });

  it("never confirms a total the customer has not seen", () => {
    expect(expressActions).toContain('const expected = Number(text(formData, "expectedTotalCents"));');
    expect(expressActions).toContain('back(storeSlug, "total_updated")');
    expect(form).toContain('<input type="hidden" name="expectedTotalCents" value={knownTotal ?? ""} />');
    expect(page).toContain("total_updated:");
  });

  it("keeps benefits optional and module-gated", () => {
    expect(page).toContain("Tenho cupom");
    expect(page).toContain("benefits.cashbackEnabled ?");
    expect(page).toContain("benefits.loyaltyEnabled ?");
    expect(page).toContain("growthEnabled && benefits");
    expect(page).toContain("applyCheckoutBenefitsAction");
    expect(service).toContain('StoreModuleStateService.isEnabled(cartResult.store.organization_id, cartResult.store.id, "growth")');
  });

  it("lets the customer change item quantities without leaving the checkout", () => {
    expect(page).toContain('<input type="hidden" name="returnTo" value="checkout" />');
    expect(page).toContain("updateCartQuantityAction");
    expect(page).toContain("removeCartItemAction");
  });

  it("keeps one prominent final completion action with the authoritative total", () => {
    expect(form).toContain("Confirmar pedido ·");
    expect(form).toContain("<footer className={styles.expressFooter}>");
    expect(page).toContain("cart.total_cents");
    expect(styles).toContain(".expressFooter{position:sticky;bottom:0");
  });

  it("uses a fullscreen responsive shell with safe overflow fallback", () => {
    expect(styles).toContain("height:100dvh");
    expect(styles).toContain("overflow-y:auto");
    expect(styles).toContain("@media(max-width:720px)");
    expect(styles).toContain("@media(max-width:480px)");
    expect(styles).toContain("grid-template-columns:1fr");
  });
});
