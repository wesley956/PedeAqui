import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const picker = readFileSync("src/components/media/image-upload-field.tsx", "utf8");
const productPage = readFileSync("src/app/(app)/cardapio/produtos/novo/page.tsx", "utf8");
const categoriesPage = readFileSync("src/app/(app)/cardapio/categorias/page.tsx", "utf8");
const menuPage = readFileSync("src/app/(app)/configuracoes/cardapio/page.tsx", "utf8");
const catalogActions = readFileSync("src/features/catalog/actions.ts", "utf8");
const menuActions = readFileSync("src/features/menu/actions.ts", "utf8");
const mediaService = readFileSync("src/server/catalog/catalog-image-service.ts", "utf8");
const nextConfig = readFileSync("next.config.ts", "utf8");

describe("device image upload UI", () => {
  it("uses a reusable local file picker with preview validation", () => {
    expect(picker).toContain('type="file"');
    expect(picker).toContain("image/jpeg,image/png,image/webp");
    expect(picker).toContain("5 * 1024 * 1024");
    expect(picker).toContain("URL.createObjectURL");
    expect(picker).toContain("Trocar imagem");
    expect(picker).toContain("Remover");
  });

  it("removes image URL inputs from the commercial catalog and menu settings", () => {
    expect(productPage).toContain('name="imageFile"');
    expect(categoriesPage).toContain('name="imageFile"');
    expect(menuPage).toContain('name="logoFile"');
    expect(menuPage).toContain('name="coverFile"');
    expect(productPage).not.toContain("URL da imagem");
    expect(categoriesPage).not.toContain("URL da imagem");
    expect(menuPage).not.toContain("URL da logo");
    expect(menuPage).not.toContain("URL da capa");
  });

  it("keeps upload authorization scoped to the operation", () => {
    expect(catalogActions).toContain("PERMISSIONS.PRODUCTS_CREATE");
    expect(menuActions).toContain("PERMISSIONS.STORES_MANAGE");
    expect(mediaService).toContain("authorize(options?.permission ?? PERMISSIONS.PRODUCTS_EDIT)");
    expect(mediaService).toContain("organizationId");
    expect(mediaService).toContain("storeId");
  });

  it("preserves or removes existing restaurant images explicitly", () => {
    expect(menuActions).toContain('formData.get("removeLogo")');
    expect(menuActions).toContain('formData.get("removeCover")');
    expect(menuActions).toContain("current.logo_url");
    expect(menuActions).toContain("current.cover_url");
  });

  it("allows multiple validated image payloads through the Server Action envelope", () => {
    expect(nextConfig).toContain('bodySizeLimit: "16mb"');
    expect(mediaService).toContain("MAX_CATALOG_IMAGE_BYTES = 5 * 1024 * 1024");
  });
});
