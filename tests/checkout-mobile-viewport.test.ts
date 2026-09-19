import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const viewportCss = read("src/app/m/[slug]/checkout/checkout-viewport.css");
const checkoutCss = read("src/app/m/[slug]/checkout/checkout.module.css");
const checkoutLayout = read("src/app/m/[slug]/checkout/layout.tsx");
const checkoutPage = read("src/app/m/[slug]/checkout/page.tsx");
const browserHomologation = read("scripts/browser-homologation.mjs");

describe("FLOW-06 mobile checkout viewport", () => {
  it("overrides the legacy vh minimum with a bounded dynamic visual viewport", () => {
    expect(checkoutCss).toContain("height:100dvh;min-height:100vh");
    expect(viewportCss).toContain("height: 100vh");
    expect(viewportCss).toContain("@supports (height: 100dvh)");
    expect(viewportCss).toContain("height: 100dvh");
    expect(viewportCss).toContain("min-height: 0");
    expect(viewportCss).toContain("max-height: 100%");
    expect(viewportCss).not.toContain("min-height: 100vh");
  });

  it("asks the browser to resize layout content for the virtual keyboard without disabling zoom", () => {
    expect(checkoutLayout).toContain('interactiveWidget: "resizes-content"');
    expect(checkoutLayout).toContain('viewportFit: "cover"');
    expect(checkoutLayout).not.toContain("userScalable: false");
    expect(checkoutLayout).not.toContain("maximumScale");
  });

  it("keeps safe-area padding and the final CTA in the grid footer", () => {
    expect(viewportCss).toContain("env(safe-area-inset-bottom)");
    expect(checkoutPage).toContain("<footer className={styles.footer}>");
    expect(checkoutPage).toContain("<SubmitOrderButton");
    expect(checkoutPage).toContain("Confirmar pedido");
    expect(checkoutCss).toContain("grid-template-rows:auto auto minmax(0,1fr) auto");
    expect(checkoutCss).toContain(".stageViewport{min-height:0;overflow-y:auto");
  });

  it("includes deterministic browser checks for required phone sizes, keyboard shrink, zoomed text and long errors", () => {
    for (const viewport of ["320, 568", "360, 640", "390, 844", "412, 915", "430, 932"]) {
      expect(browserHomologation).toContain(viewport);
    }
    expect(browserHomologation).toContain("checkout-keyboard");
    expect(browserHomologation).toContain("checkout-text-zoom");
    expect(browserHomologation).toContain("checkout-long-error");
    expect(browserHomologation).toContain("checkout-cta-visible");
  });
});
