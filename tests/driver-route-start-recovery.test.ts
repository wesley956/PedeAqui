import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const page = read("src/app/(app)/entregador/page.tsx");
const form = read("src/features/delivery/driver-route-start-form.tsx");
const actions = read("src/features/delivery/route-tracking-actions.ts");
const service = read("src/server/delivery/route-tracking-service.ts");

describe("driver route start recovery", () => {
  it("offers a recovery action when delivery is already on route without a tracking session", () => {
    expect(page).toContain("routeRecoveryDelivery");
    expect(page).toContain('fulfillment_status === "out_for_delivery"');
    expect(page).toContain("Rota em andamento · rastreamento pendente");
    expect(page).toContain("DriverRouteStartForm");
  });

  it("lets the current driver retry route-session creation from the phone", () => {
    expect(form).toContain("Ativar rastreamento da rota");
    expect(form).toContain("startDriverRouteTrackingAction");
    expect(actions).toContain("RouteTrackingService.startForDelivery(deliveryId)");
    expect(actions).toContain('revalidatePath("/entregador")');
  });

  it("keeps route creation scoped to the authenticated driver and delivery", () => {
    expect(service).toContain("PERMISSIONS.DELIVERY_UPDATE");
    expect(service).toContain('admin.rpc("driver_route_start_internal"');
    expect(service).toContain("p_actor_user_id: context.userId");
  });
});
