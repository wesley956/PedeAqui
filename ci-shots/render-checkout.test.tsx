import fs from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { it } from "vitest";
import { ExpressCheckoutForm, type ExpressCheckoutProps } from "@/features/checkout/express-checkout-form";

const css = fs.readFileSync("src/app/globals.css", "utf8") + "\n" + fs.readFileSync("src/app/m/[slug]/checkout/checkout.module.css", "utf8") + "\n" + fs.readFileSync("src/app/m/[slug]/checkout/checkout-viewport.css", "utf8") + "\n" + fs.readFileSync("src/features/menu/menu-browser.module.css", "utf8");

const base: ExpressCheckoutProps = {
  slug: "santa-rita", canOrder: true, closedMessage: null, allowDelivery: true, allowPickup: true, deliveryEta: "25–45 min",
  useNeighborhoods: false, neighborhoods: [], storeCity: "Campinas", storeState: "SP", pickupAddress: "Av. Francisco Glicério, 950 · Centro · Campinas", returningName: null,
  defaults: { fulfillment: null, name: "", phone: "", email: "", neighborhoodId: "", postalCode: "", street: "", number: "", complement: "", district: "", city: "", state: "", reference: "", paymentValue: null, changeFor: "", scheduledLocal: "" },
  items: [
    { id: "i1", productId: "p1", name: "Pizza Calabresa", imageUrl: null, quantity: 1, lineTotalCents: 5490, details: "Grande · Borda de catupiry", editable: true },
    { id: "i2", productId: "p2", name: "Coca-Cola lata", imageUrl: null, quantity: 2, lineTotalCents: 1200, details: "", editable: false },
  ],
  savedAddresses: [],
  paymentMethods: [
    { value: "pix", method: "pix", label: "Pix", help: "Aprovação na hora" },
    { value: "cash", method: "cash", label: "Dinheiro", help: "Diga se precisa de troco" },
    { value: "credit_card", method: "credit_card", label: "Cartão de crédito", help: "Na maquininha" },
    { value: "debit_card", method: "debit_card", label: "Cartão de débito", help: "Na maquininha" },
  ],
  benefits: { couponCode: "", cashbackEnabled: false, loyaltyEnabled: false, customerIdentified: false, cashbackBalanceCents: 0, loyaltyBalancePoints: 0, cashbackValue: "", loyaltyValue: "" },
  totals: { subtotalCents: 6690, discountCents: 0, deliveryFeeCents: 0, totalCents: 6690, quotedDelivery: false },
  minimumOrderCents: 3000, minimumMissingCents: 0, error: null,
};

function page(name: string, props: ExpressCheckoutProps) {
  const body = renderToStaticMarkup(<ExpressCheckoutForm {...props} />);
  const html = `<!doctype html><html lang="pt-BR" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}\n:root{--brand-primary:#C8102E;--text-on-brand:#fff}</style></head><body><div class="checkout-visual-viewport"><main class="root"><div class="appShell expressShell"><header class="topbar"><a class="iconButton" href="#" aria-label="Voltar ao cardápio"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M15 5l-7 7 7 7"/></svg></a><h1 class="topHeading">Seu pedido</h1></header><div class="stageViewport">${body}</div></div></main></div></body></html>`;
  fs.mkdirSync("ci-shots/out", { recursive: true });
  fs.writeFileSync(`ci-shots/out/${name}.html`, html);
}

it("renders checkout variants", () => {
  page("checkout-novo", base);
  page("checkout-pix", { ...base, defaults: { ...base.defaults, fulfillment: "delivery", name: "Ana Souza", phone: "(19) 98765-4321", street: "Rua das Flores", number: "120", district: "Centro", city: "Campinas", state: "SP", paymentValue: "pix", email: "ana@email.com" }, totals: { ...base.totals, deliveryFeeCents: 600, totalCents: 7290, quotedDelivery: true } });
  page("checkout-erro", { ...base, defaults: { ...base.defaults, fulfillment: "pickup", paymentValue: "cash", changeFor: "100,00" }, error: { block: "dados", message: "Informe um WhatsApp válido." } });
});
