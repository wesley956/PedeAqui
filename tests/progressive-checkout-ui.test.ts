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
    expect(page).toContain("Seu pedido");
    expect(page).toContain("<ExpressCheckoutForm");
    const items = form.indexOf('block("itens", `Itens · ${itemCount}`');
    expect(items).toBeGreaterThan(-1);
    const receiving = form.indexOf('block("receber", "Como receber"');
    const identity = form.indexOf('block("dados", "Seus dados"');
    const address = form.indexOf('block("endereco", "Endereço"');
    const payment = form.indexOf('block("pagamento", "Pagamento"');
    const when = form.indexOf('block("quando", "Quando"');
    const summary = form.indexOf(">Resumo</h2>");
    expect(receiving).toBeGreaterThan(-1);
    expect(identity).toBeGreaterThan(receiving);
    expect(address).toBeGreaterThan(identity);
    expect(payment).toBeGreaterThan(address);
    expect(when).toBeGreaterThan(payment);
    const coupon = form.indexOf('block("cupom", "Cupom"');
    expect(receiving).toBeGreaterThan(items);
    expect(coupon).toBeGreaterThan(when);
    expect(summary).toBeGreaterThan(coupon);
  });

  it("switches delivery and pickup without a reload and keeps the server state as default", () => {
    expect(page).toContain('const deliverySelected = session?.fulfillment_type === "delivery"');
    expect(form).toContain('useState<"delivery" | "pickup">(initialMode)');
    expect(form).toContain('{mode === "delivery" ? block("endereco"');
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
    expect(form).toContain("Tem cupom?");
    expect(form).toContain("props.benefits.cashbackEnabled ?");
    expect(form).toContain("props.benefits.loyaltyEnabled ?");
    expect(page).toContain("growthEnabled && benefits");
    expect(expressActions).toContain("await applyCheckoutBenefitsAction(formData)");
    expect(service).toContain('StoreModuleStateService.isEnabled(cartResult.store.organization_id, cartResult.store.id, "growth")');
  });

  it("lets the customer change item quantities without leaving the checkout", () => {
    // − / + no próprio checkout: guarda o que já foi preenchido e volta para o checkout.
    expect(form).toContain('formAction={expressItemAction} formNoValidate');
    expect(expressActions).toContain('next.set("returnTo", "checkout")');
    expect(expressActions).toContain("await updateCartQuantityAction(next)");
    expect(expressActions).toContain("if (kind === \"remove\") await removeCartItemAction(next)");
    expect(expressActions).toContain('await saveParts(formData, "draft")');
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
