import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(join(process.cwd(), "src/app/(app)/entregas/page.tsx"), "utf8");
const board = readFileSync(join(process.cwd(), "src/features/delivery/delivery-board.tsx"), "utf8");
const sla = readFileSync(join(process.cwd(), "src/features/delivery/delivery-sla.tsx"), "utf8");
const driverSettings = readFileSync(join(process.cwd(), "src/server/delivery/driver-settings-service.ts"), "utf8");
const css = readFileSync(join(process.cwd(), "src/features/delivery/delivery.module.css"), "utf8");

describe("delivery operations center", () => {
  it("organizes open deliveries into operational queues", () => {
    for (const label of ["Atrasadas", "Aguardando expedição", "Com entregador", "Retiradas", "Em rota"]) expect(board).toContain(label);
    expect(page).toContain("Entregues recentes");
  });

  it("derives lateness only from the authoritative promised_by_at", () => {
    expect(board).toContain("delivery?.promised_by_at");
    expect(board).toContain("Date.parse(promised) < now");
    expect(sla).toContain("promisedByAt");
    expect(sla).toContain("Sem prazo calculado");
  });

  it("keeps address, freight, current driver and existing transition actions", () => {
    for (const label of ["Endereço", "Entregador", "Frete", "Telefone", "Estimativa do pedido"]) expect(board).toContain(label);
    for (const intent of ["waiting", "assign", "picked_up", "out_for_delivery", "delivered"]) expect(board).toContain(`intent=\"${intent}\"`);
  });

  it("moves driver maintenance to a delivery.manage scoped Settings read", () => {
    expect(page).not.toContain("DriverCreateForm");
    expect(page).not.toContain("DriverUpdateForm");
    expect(driverSettings).toContain("authorize(PERMISSIONS.DELIVERY_MANAGE)");
  });

  it("keeps responsive and touch-friendly controls", () => {
    expect(css).toContain("@media(max-width:640px)");
    expect(css).toContain("@media(pointer:coarse)");
    expect(css).toContain("var(--control-height-lg)");
  });
});
