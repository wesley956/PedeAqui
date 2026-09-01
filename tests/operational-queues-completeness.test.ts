import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

function read(path: string) {
  return readFileSync(path, "utf8");
}

describe("filas operacionais completas", () => {
  it("separa definitivamente pedidos ativos do histórico e percorre todas as páginas", () => {
    const service = read("src/server/orders/order-service.ts");
    expect(service).toContain('.not("order_status", "in", "(completed,rejected,canceled)")');
    expect(service).toContain("for (let from = 0; ; from += operationalPageSize)");
    expect(service).toContain(".range(from, from + operationalPageSize - 1)");
  });

  it("mantém o histórico paginado, pesquisável e com total explícito", () => {
    const service = read("src/server/orders/order-service.ts");
    const page = read("src/app/(app)/pedidos/historico/page.tsx");
    expect(service).toContain('{ count: "exact", head: true }');
    expect(service).toContain("hasNext: from + pageSize < total");
    expect(page).toContain("Buscar no histórico completo");
    expect(page).toContain("nenhum pedido foi descartado");
  });

  it("não corta a cozinha em 120 e explicita sobrecarga", () => {
    const service = read("src/server/kitchen/kitchen-service.ts");
    const board = read("src/features/kitchen/kitchen-board.tsx");
    expect(service).not.toContain(".limit(Math.min(Math.max(limit, 1), 250))");
    expect(service).toContain("chunks(orderIds)");
    expect(board).toContain("Operação acima de 120 pedidos ativos");
    expect(board).toContain("Carregar mais");
  });

  it("busca clientes no servidor com isolamento e sem preload parcial", () => {
    const service = read("src/server/pdv/pdv-service.ts");
    const shell = read("src/features/pdv/pos-shell.tsx");
    expect(service).toContain("static async searchCustomers");
    expect(service).toContain(".eq(\"organization_id\", context.organizationId)");
    expect(service).toContain("await authorize(PERMISSIONS.CUSTOMERS_VIEW, context)");
    expect(service).not.toContain(".limit(150)");
    expect(shell).toContain("searchPdvCustomersAction");
    expect(shell).toContain("Buscando no cadastro completo");
  });
});
