import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkoutAddressSchema } from "@/server/checkout/schemas";

const read = (path: string) => readFileSync(path, "utf8");
const page = read("src/app/m/[slug]/checkout/page.tsx") + read("src/features/checkout/express-checkout-form.tsx") + read("src/features/checkout/express-actions.ts");  // Checkout Expresso: página + formulário único + ação
const neighborhood = read("src/features/checkout/neighborhood-select.tsx");
const checkoutService = read("src/server/checkout/checkout-service.ts");
const benefitActions = read("src/features/checkout/benefit-actions.ts");
const confirmAction = read("src/features/checkout/confirm-order-action.ts");
const orderService = read("src/server/orders/order-service.ts");

describe("PA-PUBLIC-UX-011 / #798 checkout simplification", () => {
  it("keeps identity before delivery address and payment after the address", () => {
    const fulfillmentAt = page.indexOf(">Como receber</h2>");
    const identityAt = page.indexOf(">Seus dados</h2>");
    const addressAt = page.indexOf(">Endereço</h2>");
    const paymentAt = page.indexOf(">Pagamento</h2>");
    const confirmationAt = page.indexOf("Confirmar pedido ·");
    expect(fulfillmentAt).toBeGreaterThan(-1);
    expect(identityAt).toBeGreaterThan(fulfillmentAt);
    expect(addressAt).toBeGreaterThan(identityAt);
    expect(paymentAt).toBeGreaterThan(addressAt);
    expect(confirmationAt).toBeGreaterThan(paymentAt);
    expect(page).toContain('{mode === "delivery" ? (');
  });

  it("does not dump neighborhoods before the customer searches", () => {
    expect(neighborhood).toContain("if (!needle) return []");
    expect(neighborhood).toContain('placeholder="Digite seu bairro"');
    expect(neighborhood).toContain("filtered.map((item)");
    expect(neighborhood).toContain("Ainda não entregamos nesse bairro");
  });

  it("collapses a selected neighborhood to a compact summary and lets the customer change it", () => {
    const selectedBranch = neighborhood.indexOf("{selected ? (");
    const searchInput = neighborhood.indexOf('type="search"');
    expect(selectedBranch).toBeGreaterThan(-1);
    expect(searchInput).toBeGreaterThan(selectedBranch);
    expect(neighborhood).toContain("✓ {selected.neighborhoodName}");
    expect(neighborhood).toContain("changeNeighborhood");
    expect(neighborhood).toContain(">Trocar</button>");
  });

  it("keeps CEP optional at the boundary and visually last in the address form", () => {
    const parsedWithoutCep = checkoutAddressSchema.safeParse({
      postalCode: "",
      street: "Rua A",
      number: "10",
      district: "Centro",
      city: "Nova Odessa",
      state: "SP",
    });
    expect(parsedWithoutCep.success).toBe(true);
    const referenceAt = page.indexOf('label="Referência (opcional)"');
    const cepAt = page.indexOf('label="CEP (opcional)"');
    const addressEndAt = page.indexOf("Entregamos aí", cepAt);
    expect(cepAt).toBeGreaterThan(referenceAt);
    expect(addressEndAt).toBeGreaterThan(cepAt);
    expect(checkoutService).toContain("postalCode: session.address_postal_code ?? null");
  });

  it("uses customer language for intermediate actions", () => {
    expect(page).not.toContain("Salvar dados");
    expect(page).not.toContain("Salvar endereço");
    expect(page).not.toContain("Salvar pagamento");
    expect(page).not.toContain("<ActionButton>Continuar</ActionButton>");
  });

  it("hides growth benefits when the module is unavailable and guards the actions server-side", () => {
    expect(page).toContain("growthEnabled && benefits ? (");
    expect(checkoutService).toContain('StoreModuleStateService.isEnabled(cartResult.store.organization_id, cartResult.store.id, "growth")');
    expect(benefitActions).toContain('StoreModuleStateService.isEnabled(');
    expect(benefitActions).toContain('"growth"');
    expect(benefitActions).toContain("benefit_unavailable");
  });

  it("shows only one final confirmation while the server still reviews before creating", () => {
    expect(page).toContain("confirmCheckoutOrderAction");
    expect(page).toContain("Confirmar pedido ·");
    expect(page).not.toContain("Conferir pedido");
    expect(page).not.toContain("Pendente de revisão");
    expect(confirmAction).toContain("createOrderFromCheckoutAction");
    expect(orderService).toContain("CheckoutService.review(storeSlug, token)");
  });

  it("keeps saved addresses behind trusted recognition instead of phone lookup", () => {
    expect(page).toContain("recognizedForSession && recognizedCustomer ? recognizedCustomer.addresses : []");
    expect(page).toContain("recognizedCustomer && !recognizedForSession");
    expect(checkoutService).toContain("recognized.customerId !== session.customer_id");
  });
});
