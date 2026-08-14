import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PedeAquiLogo, PedeAquiSymbol } from "@/components/brand/pedeaqui-brand";

const componentPath = path.join(process.cwd(), "src/components/brand/pedeaqui-brand.tsx");

describe("PedeAqui brand components", () => {
  it("renders the canonical light-surface logo with standardized dimensions", () => {
    const markup = renderToStaticMarkup(createElement(PedeAquiLogo, { size: "sm" }));

    expect(markup).toContain('src="/brand/pedeaqui-logo.svg"');
    expect(markup).toContain('alt="PedeAqui"');
    expect(markup).toContain('width="93"');
    expect(markup).toContain('height="32"');
    expect(markup).toContain('data-brand="pedeaqui-logo"');
  });

  it("selects the canonical dark-surface logo without duplicating SVG markup", () => {
    const markup = renderToStaticMarkup(createElement(PedeAquiLogo, { surface: "dark", size: "md" }));
    const source = readFileSync(componentPath, "utf8");

    expect(markup).toContain('src="/brand/pedeaqui-logo-on-dark.svg"');
    expect(source).not.toContain("<svg");
    expect(source).toContain('src="/brand/pedeaqui-symbol.svg"');
  });

  it("renders the official symbol and supports decorative accessibility", () => {
    const markup = renderToStaticMarkup(createElement(PedeAquiSymbol, { size: "lg", decorative: true }));

    expect(markup).toContain('src="/brand/pedeaqui-symbol.svg"');
    expect(markup).toContain('alt=""');
    expect(markup).toContain('aria-hidden="true"');
    expect(markup).toContain('width="56"');
    expect(markup).toContain('height="56"');
  });
});
