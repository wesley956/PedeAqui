import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("consertos do celular (Fase A)", () => {
  it("never squeezes the item name in Personalizar menu: buttons wrap to a second line", () => {
    const css = read("src/app/(app)/meu-menu/menu-customizer.module.css");
    expect(css).toContain(".label { flex: 1 1 0; min-width: 9ch;");
    expect(css).not.toContain("overflow-wrap: anywhere");
    expect(css).toContain(".row { flex-wrap: wrap;");
  });

  it("keeps flavor groups and complements inside the screen on narrow phones", () => {
    expect(read("src/features/menu/modifier-group-selector.module.css")).toContain(".group{min-width:0;");
    const productCss = read("src/app/m/[slug]/produto/[id]/public-product.module.css");
    expect(productCss).toContain(".stepBlock>*{min-width:0}");
    expect(productCss).toContain(".form{grid-template-columns:minmax(0,1fr)}");
    expect(productCss).toContain(".sheetForm .complementBlock{padding:14px 16px;");
    expect(read("src/features/menu/product-detail.tsx")).toContain("styles.complementBlock");
  });

  it("does not cut PDV product cards", () => {
    const css = read("src/features/pdv/pdv.module.css");
    expect(css).toContain(".productCard{min-width:0;overflow:hidden}");
    expect(css).toContain(".productCard .rowBetween{flex-wrap:wrap;");
  });

  it("shows the default picture when a product photo or logo fails to load", () => {
    const fallback = read("src/components/ui/fallback-image.tsx");
    expect(fallback).toContain("onError={() => setFailedSource(src)}");
    expect(fallback).toContain("element.naturalWidth === 0");
    expect(read("src/features/menu/public-product-card.tsx")).toContain("<FallbackImage");
    expect(read("src/features/menu/product-detail.tsx")).toContain("<FallbackImage");
    expect(read("src/features/menu/public-brand.tsx")).toContain("<FallbackImage");
  });

  it("fixes the texts seen on the phone", () => {
    const guide = read("src/features/user-guide/guide-model.ts");
    expect(guide).not.toContain("nesta ${");
    expect(read("src/features/user-guide/new-user-guide.tsx")).toContain('step.completionLabel && step.state === "done"');
    expect(read("src/app/(app)/configuracoes/entrega/page.tsx")).toContain('className={styles.note} style={{ display: "grid"');
  });
});
