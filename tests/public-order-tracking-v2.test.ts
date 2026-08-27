import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const page = readFileSync("src/app/m/[slug]/pedido/[id]/page.tsx", "utf8");
const timeline = readFileSync("src/features/orders/public-order-timeline.tsx", "utf8");
const styles = readFileSync("src/app/m/[slug]/pedido/[id]/order-tracking.module.css", "utf8");

describe("public order tracking V2", () => {
  it("keeps public access behind the store-scoped order token and authoritative service", () => {
    expect(page).toContain("orderCookieName(slug, id)");
    expect(page).toContain("PublicOrderService.get(slug, id, accessToken)");
    expect(page).toContain("if (!accessToken) notFound()");
  });

  it("puts the live timeline before collapsed secondary details", () => {
    const progress = page.indexOf("Acompanhe seu pedido");
    const details = page.indexOf("Ver detalhes do pedido");
    expect(progress).toBeGreaterThan(-1);
    expect(details).toBeGreaterThan(progress);
    expect(page).toContain("<PublicOrderTimeline");
  });

  it("keeps the confirmation hero compact so tracking appears earlier", () => {
    expect(styles).toContain(".hero{padding:var(--space-4)");
    expect(styles).toContain("grid-template-columns:max-content max-content");
    expect(styles).toContain(".successIcon{grid-column:1/-1;justify-self:center;width:44px;height:44px");
    expect(styles).toContain(".status{grid-column:1;justify-self:end");
    expect(styles).toContain(".estimate{grid-column:2;justify-self:start;display:flex");
    expect(styles).toContain("@media(max-width:360px)");
  });

  it("highlights the display number without creating another large card", () => {
    expect(page).toContain("styles.orderNumber");
    expect(page).toContain("PEDIDO");
    expect(page).toContain("#{order.display_number}");
    expect(page).toContain("aria-label={`Número do pedido ${order.display_number}`}");
    expect(page).toContain("Atualizado em {updatedAt}");
    expect(page).not.toContain("Pedido #{order.display_number} · atualizado em");
    expect(styles).toContain(".orderNumber{grid-column:1/-1;justify-self:center;display:inline-flex");
    expect(styles).toContain(".orderNumber strong{color:var(--brand-primary);font-size:clamp(1.45rem,4vw,1.75rem)");
  });

  it("keeps Pix and refresh behavior without inventing a new payment or polling contract", () => {
    expect(page).toContain("<PublicOrderRefresh");
    expect(page).toContain("<PixCopyButton");
    expect(page).toContain("pixPayment.qrCode");
    expect(page).toContain("!terminal ? <PublicOrderRefresh /> : null");
  });

  it("shows delivery and pickup from the existing fulfillment type only", () => {
    expect(page).toContain('fulfillmentType === "delivery"');
    expect(page).toContain("Pronto para retirada");
    expect(timeline).toContain('input.fulfillmentType === "delivery"');
    expect(timeline).toContain('input.fulfillmentType === "pickup"');
    expect(timeline).toContain('input.fulfillmentStatus === "out_for_delivery"');
    expect(timeline).toContain('input.fulfillmentStatus === "delivered"');
  });

  it("keeps modifier quantities visible in the order details", () => {
    expect(page).toContain("function modifierText");
    expect(page).toContain('`${quantity}x `');
    expect(page).toContain("item.modifiers.map(modifierText)");
  });

  it("does not advertise tracking capabilities that the backend does not expose", () => {
    expect(page).not.toContain("ACOMPANHAR ENTREGA");
    expect(page).not.toContain("Acompanhar entrega");
    expect(page).not.toContain("Entregador:");
  });

  it("keeps terminal repeat-order action and accessible compact details", () => {
    expect(page).toContain("Fazer novo pedido");
    expect(styles).toContain(".orderDetails>summary:focus-visible");
    expect(styles).toContain("@media(max-width:640px)");
  });
});
