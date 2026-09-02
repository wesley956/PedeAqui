import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), "utf8");

describe("operational board and history separation [817]", () => {
  const service = read("src/server/orders/order-service.ts");
  const page = read("src/app/(app)/pedidos/page.tsx");
  const history = read("src/app/(app)/pedidos/historico/page.tsx");

  it("loads every active order independently from date and history limits", () => {
    expect(service).toContain('.not("order_status", "in", "(completed,rejected,canceled)")');
    expect(service).toContain("for (let from = 0; ; from += operationalPageSize)");
    expect(service).not.toContain("created_at.gte");
  });

  it("keeps a bounded rolling recent-finalized window across midnight", () => {
    expect(service).toContain("recentFinalizedWindowMs = 2 * 60 * 60_000");
    expect(service).toContain('.gte("updated_at", recentSince)');
    expect(service).toContain("recentFinalizedLimit = 12");
    expect(page).toContain("Finalizados recentemente");
    expect(page).toContain("atravessa a meia-noite");
  });

  it("keeps the complete terminal history paginated and searchable", () => {
    expect(service).toContain("static async listHistory");
    expect(service).toContain('.in("order_status", ["completed", "rejected", "canceled"])');
    expect(history).toContain("histórico está paginado; nenhum pedido foi descartado");
    expect(history).toContain("Buscar no histórico completo");
  });
});
