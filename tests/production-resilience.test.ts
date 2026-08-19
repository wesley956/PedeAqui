import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  MAX_STORE_SLUG_LENGTH,
  isStoreSlugConflict,
  slugifyStoreName,
  storeSlugCandidate,
} from "@/server/onboarding/store-slug";
import { realtimeStoreScope } from "@/lib/supabase/realtime";

const nextConfig = readFileSync("next.config.ts", "utf8");
const catalogActions = readFileSync("src/features/catalog/actions.ts", "utf8");
const catalogImageService = readFileSync("src/server/catalog/catalog-image-service.ts", "utf8");
const categoryPage = readFileSync("src/app/(app)/cardapio/categorias/page.tsx", "utf8");
const productPage = readFileSync("src/app/(app)/cardapio/produtos/novo/page.tsx", "utf8");
const appErrorBoundary = readFileSync("src/app/(app)/error.tsx", "utf8");
const ciWorkflow = readFileSync(".github/workflows/ci.yml", "utf8");

describe("catalog resilience contracts", () => {
  it("keeps enough aggregate envelope for multiple valid images", () => {
    expect(nextConfig).toContain('bodySizeLimit: "16mb"');
    expect(catalogImageService).toContain("MAX_CATALOG_IMAGE_BYTES = 5 * 1024 * 1024");
  });

  it("rolls back a newly uploaded image when persistence fails", () => {
    expect(catalogImageService).toContain("static async remove(path: string)");
    expect(catalogActions).toContain("await rollbackCatalogImage(uploaded)");
    expect(catalogImageService).toContain("catalog_image_rollback_failed");
  });

  it("uses resilient forms for category and product creation", () => {
    expect(categoryPage).toContain("ResilientMutationForm");
    expect(categoryPage).toContain("createCategoryFormAction");
    expect(productPage).toContain("ResilientMutationForm");
    expect(productPage).toContain("createProductFormAction");
  });
});

describe("onboarding store slug resilience", () => {
  it("normalizes names and generates deterministic collision candidates", () => {
    expect(slugifyStoreName("  Pizzaria São João  ")).toBe("pizzaria-sao-joao");
    expect(storeSlugCandidate("Pizzaria São João", 0)).toBe("pizzaria-sao-joao");
    expect(storeSlugCandidate("Pizzaria São João", 1)).toBe("pizzaria-sao-joao-2");
    expect(storeSlugCandidate("Pizzaria São João", 2)).toBe("pizzaria-sao-joao-3");
  });

  it("keeps generated candidates inside the database slug limit", () => {
    const candidate = storeSlugCandidate("A".repeat(120), 19);
    expect(candidate.length).toBeLessThanOrEqual(MAX_STORE_SLUG_LENGTH);
    expect(candidate).toMatch(/-20$/);
  });

  it("retries only a unique violation that points to the store slug", () => {
    expect(isStoreSlugConflict({
      code: "23505",
      message: 'duplicate key value violates unique constraint "stores_slug_key"',
      details: "Key (slug)=(pizzaria) already exists.",
    })).toBe(true);
    expect(isStoreSlugConflict({ code: "23505", message: "other_unique_key" })).toBe(false);
    expect(isStoreSlugConflict({ code: "42501", message: "permission denied" })).toBe(false);
  });
});

describe("Realtime store scope", () => {
  it("builds the canonical store_id filter for a UUID", () => {
    expect(realtimeStoreScope("550e8400-e29b-41d4-a716-446655440000")).toEqual({
      storeId: "550e8400-e29b-41d4-a716-446655440000",
      filter: "store_id=eq.550e8400-e29b-41d4-a716-446655440000",
    });
  });

  it("refuses malformed or injectable store identifiers", () => {
    expect(realtimeStoreScope("")).toBeNull();
    expect(realtimeStoreScope("not-a-uuid")).toBeNull();
    expect(realtimeStoreScope("550e8400-e29b-41d4-a716-446655440000,or=(true)")).toBeNull();
  });
});

describe("production safeguards", () => {
  it("keeps a branded recovery boundary for authenticated routes", () => {
    expect(appErrorBoundary).toContain("Não foi possível concluir esta operação");
    expect(appErrorBoundary).toContain("Tentar novamente");
    expect(appErrorBoundary).toContain("reset");
  });

  it("runs infrastructure preflight in CI", () => {
    expect(ciWorkflow).toContain("Production infrastructure preflight");
    expect(ciWorkflow).toContain("npm run preflight:production");
  });
});
