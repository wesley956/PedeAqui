import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const page = readFileSync(join(process.cwd(), "src/app/(app)/pedidos/[id]/page.tsx"), "utf8");
const css = readFileSync(join(process.cwd(), "src/app/(app)/pedidos/[id]/order-detail.module.css"), "utf8");

describe("order detail operational hierarchy", () => {
  it("puts status and next action before secondary information", () => {
    expect(page.indexOf("Próxima ação")).toBeGreaterThan(-1);
    expect(page.indexOf("Próxima ação")).toBeLessThan(page.indexOf("Itens do pedido"));
    expect(page.indexOf("Itens do pedido")).toBeLessThan(page.indexOf("Histórico do pedido"));
    expect(page.indexOf("Histórico do pedido")).toBeLessThan(page.indexOf("Ações administrativas"));
  });

  it("keeps every existing order transition intent wired through OrderActionForm", () => {
    for (const intent of ["accept", "reject", "cancel", "start_production", "mark_ready", "await_pickup", "customer_picked_up", "await_courier", "courier_assigned", "courier_picked_up", "out_for_delivery", "delivered", "served", "complete", "print", "reprint"]) {
      expect(page).toContain(`intent=\"${intent}\"`);
    }
  });

  it("shows complete operational snapshots and store-local timestamps", () => {
    for (const detail of ["Agendado para", "E-mail", "Complemento", "CEP", "Motivo do cancelamento", "Última atualização"]) {
      expect(page).toContain(detail);
    }
    expect(page).toContain("timeZone");
    expect(page).toContain("Imprimir pedido agora");
  });

  it("uses semantic status language and hides technical order id from the visible layout", () => {
    expect(page).toContain("SemanticStatus");
    expect(page).not.toContain("<Info label=\"ID");
    expect(page).not.toContain("Pedido · ID");
  });

  it("keeps the detail responsive and touch friendly", () => {
    expect(css).toContain("@media(max-width:900px)");
    expect(css).toContain("@media(max-width:640px)");
    expect(css).toContain("@media(pointer:coarse)");
    expect(css).toContain("var(--control-height-lg)");
  });
});
