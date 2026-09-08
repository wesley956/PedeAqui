import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("omnichannel external delivery", () => {
  it("represents provider logistics without creating internal drivers", () => {
    const policy = source("src/server/delivery/external-delivery-policy-service.ts");
    expect(policy).toContain('new Set(["ifood", "99food", "99entrega"])');
    expect(policy).toContain('from("external_orders")');
    expect(policy).not.toContain('from("drivers").insert');
    expect(policy).not.toContain('from("deliveries").insert');
  });

  it("blocks waiting, assignment and self claim at the service boundary", () => {
    const operations = source("src/server/delivery/delivery-operations-service.ts");
    expect(operations.match(/assertInternalOwnership/g)?.length).toBeGreaterThanOrEqual(3);
    expect(operations).toContain('availableDeliveries: availableRows.filter((order) => !externalAvailable[order.id])');
  });

  it("blocks manual delivery when the provider owns logistics", () => {
    const manual = source("src/server/delivery/manual-delivery-service.ts");
    expect(manual).toContain("ExternalDeliveryPolicyService.assertInternalOwnership(id)");
  });

  it("shows provider logistics in the same delivery board and removes internal actions", () => {
    const board = source("src/features/delivery/delivery-board.tsx");
    expect(board).toContain("external_delivery");
    expect(board).toContain("externallyManaged");
    expect(board).toContain("não atribua entregador do PedeAqui");
    expect(board).toContain('data-logistics={order.external_delivery?.logisticsOwner ?? "internal"}');
    expect(board).toContain("!externallyManaged && order.fulfillment_status");
  });

  it("keeps workflow lanes independent from logistics provider", () => {
    const board = source("src/features/orders/order-manager-board.tsx");
    const custom = source("src/features/orders/custom-order-workflow-board.tsx");
    expect(board).not.toContain("activeBuckets.push");
    expect(custom).not.toContain("config.delivery.push");
  });
});
