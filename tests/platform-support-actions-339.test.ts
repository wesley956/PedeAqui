import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");
const service = read("src/server/platform/platform-support-action-service.ts");
const reader = read("src/server/platform/platform-support-read-service.ts");
const actions = read("src/features/platform-support/actions.ts");
const panel = read("src/app/platform/support-actions-panel.tsx");

describe("Platform safe support actions [339]", () => {
  it("keeps business-changing support actions restricted to super_admin", () => {
    expect(service).toContain('access.role !== "super_admin"');
    expect(service).toContain("PlatformAuthorizationError");
    expect(reader).toContain('access.role !== "super_admin"');
    expect(panel).toContain("Alterações comerciais exigem permissão elevada");
  });

  it("validates the target tenant server-side before mutating anything", () => {
    expect(service).toContain('from("stores").select("id,organization_id,status")');
    expect(service).toContain('.eq("id", storeId).eq("organization_id", organizationId)');
    expect(service.indexOf("await assertTarget")).toBeLessThan(service.indexOf("await claim"));
  });

  it("requires reason, protocol and idempotency for every action", () => {
    expect(service).toContain("idempotency_keys");
    expect(service).toContain("platform.support.${action}");
    expect(service).toContain("support_reason");
    expect(service).toContain("request_id: ctx.protocol");
    expect(panel).toContain('name="reason"');
    expect(panel).toContain('name="protocol"');
    expect(panel).toContain('name="idempotencyKey"');
  });

  it("records before/after audit and emits a support domain event", () => {
    expect(service).toContain('from("audit_logs").insert');
    expect(service).toContain("before_data: before ?? null");
    expect(service).toContain("after_data:");
    expect(service).toContain('from("domain_events").insert');
    expect(service).toContain('event_type: `platform.support.${action}`');
  });

  it("only exposes explicit configuration operations and never edits order/payment ledgers", () => {
    for (const method of ["setStoreStatus", "setMenuPublished", "setAcceptingOrders", "setFulfillment", "setPaymentMethod", "addStoreHour", "configureDelivery"]) expect(service).toContain(`static async ${method}`);
    expect(service).not.toMatch(/from\("orders"\).*update/s);
    expect(service).not.toMatch(/from\("payments"\).*update/s);
    expect(service).not.toContain("payment_status");
    expect(service).not.toContain("order_status");
  });

  it("preserves schedule invariants and refuses to disable every fulfillment mode", () => {
    expect(service).toContain("assertNoScheduleOverlap");
    expect(service).toContain("Mantenha pelo menos entrega ou retirada habilitada");
    expect(service).toContain("O horário de abertura e fechamento não pode ser igual");
  });

  it("server actions revalidate the owner dashboard and the exact restaurant 360 page", () => {
    expect(actions).toContain('revalidatePath("/platform")');
    expect(actions).toContain("/platform/empresas/${org}/unidades/${store}");
    expect(panel).toContain("Use apenas valores confirmados pelo restaurante");
    expect(panel).toContain("Esta central não altera status financeiro nem força estados de pedidos");
  });
});
