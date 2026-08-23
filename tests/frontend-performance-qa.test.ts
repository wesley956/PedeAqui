import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8").replace(/\s+/g, " ");

describe("frontend performance QA [316]", () => {
  it("defers expensive public menu filtering away from urgent typing", () => {
    const browser = read("src/features/menu/menu-browser.tsx");
    expect(browser).toContain("useDeferredValue");
    expect(browser).toContain("const deferredQuery = useDeferredValue(query)");
    expect(browser).toContain("normalize(deferredQuery)");
  });

  it("allows offscreen menu categories to skip rendering work", () => {
    const css = read("src/features/menu/menu-browser.module.css");
    expect(css).toContain("content-visibility:auto");
    expect(css).toContain("contain-intrinsic-size:auto 420px");
  });

  it("keeps product thumbnails lazy with explicit dimensions and async decode", () => {
    const card = read("src/features/menu/public-product-card.tsx");
    expect(card).toContain('width={104} height={104} loading="lazy" decoding="async"');
    expect(card).not.toContain('fetchPriority="high"');
  });

  it("prioritizes only the above-fold product hero", () => {
    const page = read("src/app/m/[slug]/produto/[id]/page.tsx");
    expect(page).toContain('width={720} height={360} fetchPriority="high" decoding="async"');
  });

  it("keeps cart thumbnails out of the critical loading path", () => {
    const cart = read("src/app/m/[slug]/carrinho/page.tsx");
    expect(cart).toMatch(/width=\{\d+\} height=\{\d+\} loading="lazy" decoding="async"/);
    expect(cart).not.toContain('fetchPriority="high"');
  });

  it("records a before/after baseline without inventing browser timings", () => {
    const doc = read("docs/performance/FRONTEND_BASELINE_316.md");
    expect(doc).toContain("Antes → depois");
    expect(doc).toContain("não possui um catálogo de produção populado");
    expect(doc).toContain("LCP");
    expect(doc).toContain("CLS");
    expect(doc).toContain("hidratação");
  });
});