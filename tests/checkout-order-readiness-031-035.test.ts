import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const checkoutPage = read("src/app/m/[slug]/checkout/page.tsx");
const checkoutService = read("src/server/checkout/checkout-service.ts");
const publicOrderPage = read("src/app/m/[slug]/pedido/[id]/page.tsx");
const manager = read("src/features/orders/order-manager-board.tsx");
const orderService = read("src/server/orders/order-service.ts");
const scheduleMigration = read("supabase/sql/117_checkout_scheduling.sql");
const compatibilityMigration = read("supabase/sql/118_checkout_order_growth_gas_compatibility.sql");

describe("presentation diagnostics 031–035", () => {
  it("renders every enabled store payment method and keeps payment validation authoritative", () => {
    expect(checkoutPage).toContain("data.paymentMethods.filter((item) => item.enabled)");
    expect(checkoutPage).toContain("enabledMethods.map");
    expect(checkoutService).toContain("StorePaymentMethodService.listForStore");
    expect(checkoutService).toContain("Forma de pagamento indisponível");
  });

  it("blocks duplicate order clicks while database creation remains idempotent", () => {
    const button = read("src/features/checkout/submit-order-button.tsx");
    expect(button).toContain("useFormStatus");
    expect(button).toContain("disabled={pending}");
    expect(compatibilityMigration).toContain("select * into v_existing from public.orders where source_cart_id = v_cart.id");
    expect(compatibilityMigration).toContain("'created',false");
  });

  it("shows confirmation, inline order identity, collapsible items, values, payment and requested schedule", () => {
    expect(publicOrderPage).toContain("Pedido confirmado");
    expect(publicOrderPage).toContain("styles.orderIdentity");
    expect(publicOrderPage).toContain("Pedido <strong>#{order.display_number}</strong>");
    expect(publicOrderPage).toContain("styles.successIcon");
    expect(publicOrderPage).toContain("Ver detalhes do pedido");
    expect(publicOrderPage).toContain("Valores e pagamento");
    expect(publicOrderPage).toContain('label="Quando"');
  });

  it("subscribes the manager to inserted orders and presents menu/table labels cleanly", () => {
    expect(manager).toContain('event: "INSERT"');
    expect(manager).toContain('table: "orders"');
    expect(manager).toContain("router.refresh()");
    expect(manager).toContain('digital_menu: "Cardápio"');
    expect(manager).toContain('type === "dine_in" || type === "table"');
    expect(orderService).toContain("scheduled_for");
  });

  it("preserves observations, coupons, gas snapshots and scheduling in one order pipeline", () => {
    expect(compatibilityMigration).toContain("resolve_growth_benefits");
    expect(compatibilityMigration).toContain("coupon_discount_cents");
    expect(compatibilityMigration).toContain("v_cart_item.note");
    expect(compatibilityMigration).toContain("order_item_gas_options");
    expect(scheduleMigration).toContain("orders_checkout_schedule_snapshot");
    expect(scheduleMigration).toContain("print_jobs_order_schedule_snapshot");
  });

  it("updates checkout stages partially instead of clearing previously saved fields", () => {
    const updateAt = checkoutService.indexOf('.from("checkout_sessions")\n      .update(values)');
    const insertAt = checkoutService.indexOf('.from("checkout_sessions").insert({');
    expect(updateAt).toBeGreaterThan(-1);
    expect(insertAt).toBeGreaterThan(updateAt);
    expect(checkoutService).not.toContain('.from("checkout_sessions").upsert(');
  });
});
