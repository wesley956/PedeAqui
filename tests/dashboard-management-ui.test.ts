import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(join(process.cwd(), "src/app/(app)/dashboard/page.tsx"), "utf8");
const service = readFileSync(join(process.cwd(), "src/server/dashboard/dashboard-service.ts"), "utf8");
const css = readFileSync(join(process.cwd(), "src/app/(app)/dashboard/dashboard.module.css"), "utf8");
const errorState = readFileSync(join(process.cwd(), "src/app/(app)/dashboard/error.tsx"), "utf8");

describe("management dashboard", () => {
  it("shows practical KPIs from named operational sources", () => {
    for (const label of ["Vendas hoje", "Pedidos concluídos", "Ticket médio", "Pedidos abertos", "Cancelamentos", "Entregas atrasadas", "Caixas abertos", "Estoque crítico"]) {
      expect(page).toContain(label);
    }
    expect(page).toContain("Vendas por hora");
    expect(page).toContain("Produtos mais vendidos");
  });

  it("keeps revenue/order comparisons tied to the canonical dashboard snapshot", () => {
    expect(service).toContain('admin.rpc("dashboard_snapshot_internal"');
    expect(page).toContain("snapshot.previous_sales_cents");
    expect(page).toContain("snapshot.previous_sales_count");
    expect(page).not.toContain("previousCancellations");
    expect(page).not.toContain("previousLateDeliveries");
  });

  it("derives supplemental operational signals from authoritative module data", () => {
    expect(service).toContain('.from("order_state_history")');
    expect(service).toContain('.in("to_state", ["canceled", "rejected"])');
    expect(service).toContain('.from("cash_sessions")');
    expect(service).toContain('.eq("status", "open")');
    expect(service).toContain('.from("deliveries")');
    expect(service).toContain('.lt("promised_by_at", snapshot.generated_at)');
    expect(service).toContain('.from("inventory_item_stores")');
    expect(service).toContain("<= Number(row.minimum_quantity)");
  });

  it("keeps delivery delay scoped to confirmed orders still in an open delivery state", () => {
    expect(service).toContain('.eq("order_status", "confirmed")');
    expect(service).toContain('["pending", "awaiting_assignment", "assigned", "picked_up", "out_for_delivery"]');
  });

  it("links management signals back to their source modules", () => {
    for (const href of ["/pedidos", "/entregas", "/caixa", "/estoque"]) expect(page).toContain(`href=\"${href}\"`);
  });

  it("has responsive, empty and explicit failure states instead of estimated fallback metrics", () => {
    expect(css).toContain("@media(max-width:1180px)");
    expect(css).toContain("@media(max-width:720px)");
    expect(css).toContain("@media(max-width:460px)");
    expect(page).toContain("Ainda não há pedidos concluídos hoje");
    expect(errorState).toContain("Os indicadores não foram estimados");
    expect(errorState).toContain("Tentar novamente");
  });
});
