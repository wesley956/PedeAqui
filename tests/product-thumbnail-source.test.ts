import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProductThumbnail } from "@/components/catalog/product-thumbnail";

describe("display-only product images", () => {
  it("preserves original image source without introducing the image optimization endpoint", () => {
    const url = "https://example.com/original-product.jpg";
    const html = renderToStaticMarkup(createElement(ProductThumbnail, { src: url }));
    expect(html).toContain(`src="${url}"`);
    expect(html).not.toContain("/_next/image");
    expect(html).not.toContain("srcSet=");
  });
  it("keeps products without a photo renderable without a failing image request", () => {
    const html = renderToStaticMarkup(createElement(ProductThumbnail, { src: null }));
    expect(html).toContain("<svg");
    expect(html).not.toContain("<img");
  });
});
