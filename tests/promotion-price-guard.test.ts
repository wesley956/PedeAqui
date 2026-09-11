import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("scheduled promotion price guard", () => {
  it("requires the promotional price to be strictly lower than the regular price", () => {
    const service = read("src/server/promotions/promotion-service.ts");
    expect(service).toContain("item.promotionalPriceCents >= Number(product.price_cents)");
    expect(service).toContain("precisa ser menor que o preço normal");
  });

  it("never decorates public menu or product detail with an equal-price promotion", () => {
    const publicMenu = read("src/server/menu/public-menu-service.ts");
    expect(publicMenu).toContain("schedule.promotional_price_cents < product.price_cents");
    expect(publicMenu).toContain("promotion.promotional_price_cents < productState.product.price_cents");
    expect(publicMenu).not.toContain("schedule.promotional_price_cents <= product.price_cents");
    expect(publicMenu).not.toContain("promotion.promotional_price_cents <= productState.product.price_cents");
  });
});
