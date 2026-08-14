import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { groupPublicOrderModifiers } from "@/server/orders/public-order-projection";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("backend performance contracts [310]", () => {
  it("loads public tracking order and items in the same I/O phase", () => {
    const source = read("src/server/orders/public-order-service.ts");
    expect(source).toContain("Promise.all([");
    const promiseBlock = source.slice(source.indexOf("Promise.all(["), source.indexOf("]);", source.indexOf("Promise.all([")) + 3);
    expect(promiseBlock).toContain('admin.from("orders")');
    expect(promiseBlock).toContain('admin.from("order_items")');
    expect(promiseBlock).toContain('public_access_token_hash');
  });

  it("groups modifier snapshots once instead of filtering the full list per item", () => {
    const rows = [
      { order_item_id: "a", modifier_name_snapshot: "Queijo", unit_price_cents: 200 },
      { order_item_id: "b", modifier_name_snapshot: "Bacon", unit_price_cents: 300 },
      { order_item_id: "a", modifier_name_snapshot: "Molho", unit_price_cents: 100 },
    ];
    const grouped = groupPublicOrderModifiers(rows);
    expect(grouped.get("a")?.map((item) => item.modifier_name_snapshot)).toEqual(["Queijo", "Molho"]);
    expect(grouped.get("b")?.map((item) => item.modifier_name_snapshot)).toEqual(["Bacon"]);
    expect(read("src/server/orders/public-order-service.ts")).not.toContain("modifiersResult.data ?? []).filter");
  });

  it("keeps critical list/snapshot payloads bounded", () => {
    const orders = read("src/server/orders/order-service.ts");
    const kitchen = read("src/server/kitchen/kitchen-service.ts");
    const pdv = read("src/server/pdv/pdv-service.ts");
    expect(orders).toContain("Math.min(Math.max(limit, 1), 250)");
    expect(kitchen).toContain("Math.min(Math.max(limit, 1), 250)");
    expect(pdv).toContain(".limit(150)");
  });

  it("records measured evidence and rejects speculative index churn", () => {
    const doc = read("docs/performance/BACKEND_BASELINE_310.md");
    expect(doc).toContain("4 → 3 fases");
    expect(doc).toContain("0 índices adicionados e 0 removidos");
    expect(doc).toContain("pg_stat_statements");
    expect(doc).toContain("EXPLAIN (ANALYZE, BUFFERS)");
  });
});
