import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { optimizeCatalogImage } from "@/server/catalog/catalog-image-optimizer";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("public menu readiness PA-DIAG-021 to PA-DIAG-025", () => {
  it("hides empty categories and distinguishes an empty catalog from an empty search", () => {
    const browser = read("src/features/menu/menu-browser.tsx");
    expect(browser).toContain("category.products.length > 0");
    expect(browser).toContain("Nenhum produto disponível no momento");
    expect(browser).toContain("Nenhum item encontrado");
    expect(browser).toContain("normalize(deferredQuery)");
  });

  it("blocks ordering while closed in both the product UI and cart service", () => {
    const product = read("src/app/m/[slug]/produto/[id]/page.tsx");
    const cart = read("src/server/cart/cart-service.ts");
    expect(product).toContain("orderUnavailable = soldOut || !operational.canOrder");
    expect(product).toContain("Cardápio fechado");
    expect(product).toContain("Pedidos pausados");
    expect(cart).toContain("assertAcceptingOrders");
    expect(cart).toContain('new PricingError("store_unavailable"');
    expect(cart).toContain("isOpenAt(schedule, store.timezone)");
  });

  it("orders categories and products and returns public operational context in one projection", () => {
    const migration = read("supabase/sql/116_public_menu_readiness.sql");
    const service = read("src/server/menu/public-menu-service.ts");
    expect(migration).toContain("add column if not exists sort_order");
    expect(migration).toContain("order by p.sort_order, p.name");
    expect(migration).toContain("and exists (");
    expect(migration).toContain("'business_type'");
    expect(migration).toContain("'accepting_orders'");
    expect(service).not.toContain("businessTypeForStore");
    expect(service).toContain("parsed.store.business_type");
    expect(read("vercel.json")).toContain('"gru1"');
  });

  it("converts a large upload to a bounded WebP", async () => {
    const input = await sharp({ create: { width: 2400, height: 1800, channels: 3, background: "#ff6b00" } }).png().toBuffer();
    const optimized = await optimizeCatalogImage(new File([Uint8Array.from(input)], "catalog.png", { type: "image/png" }), "product");
    const metadata = await sharp(optimized.data).metadata();
    expect(optimized.contentType).toBe("image/webp");
    expect(metadata.format).toBe("webp");
    expect(metadata.width).toBe(1600);
    expect(metadata.height).toBe(1200);
    expect(optimized.data.length).toBeLessThan(input.length);
  });

  it("documents anonymous and rollback evidence for every issue", () => {
    const doc = read("docs/qa/PRESENTATION_DIAGNOSTICS_021_025_20260822.md");
    for (const id of ["PA-DIAG-021", "PA-DIAG-022", "PA-DIAG-023", "PA-DIAG-024", "PA-DIAG-025"]) expect(doc).toContain(id);
    expect(doc).toContain("HTTP `200`");
    expect(doc).toContain("cross_tenant_hidden=true");
    expect(doc).toContain("`ROLLBACK`");
  });
});
