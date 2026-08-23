import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

const migration = read("supabase/sql/133_driver_history_restaurant_control.sql");
const policy = read("src/server/delivery/driver-history-policy-service.ts");
const settings = read("src/app/(app)/configuracoes/entrega/page.tsx");
const driverPage = read("src/app/(app)/entregador/page.tsx");
const attribution = read("src/server/delivery/order-delivery-attribution-service.ts");
const orderHistory = read("src/app/(app)/pedidos/historico/page.tsx");

describe("driver history restaurant control", () => {
  it("keeps driver history private by default and lets the restaurant manage it", () => {
    expect(migration).toContain("driver_history_visible boolean not null default false");
    expect(policy).toContain("PERMISSIONS.DELIVERY_MANAGE");
    expect(policy).toContain("delivery.driver_history_visibility_updated");
    expect(settings).toContain("Mostrar histórico de entregas concluídas ao entregador");
    expect(settings).toContain("Salvar acesso do entregador");
  });

  it("only renders completed history when the store policy allows it", () => {
    expect(driverPage).toContain("DriverHistoryPolicyService.get()");
    expect(driverPage).toContain("const history = historyVisible");
    expect(driverPage).toContain("historyVisible && history.length > 0");
  });

  it("keeps restaurant history independent from the driver visibility switch", () => {
    expect(settings).toContain("O histórico continua disponível para o restaurante mesmo quando esta opção estiver desligada.");
    expect(attribution).toContain("PERMISSIONS.ORDERS_VIEW");
    expect(attribution).toContain('.from("deliveries")');
    expect(attribution).toContain('.from("drivers")');
    expect(orderHistory).toContain("OrderDeliveryAttributionService.forOrders");
    expect(orderHistory).toContain("Entregue por ${attribution.driverName}");
    expect(orderHistory).toContain("Entregador não registrado");
  });
});
