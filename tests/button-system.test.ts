import fs from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button } from "@/components/ui/button";

const root = process.cwd();
const css = fs.readFileSync(path.join(root, "src/components/ui/button.module.css"), "utf8");

describe("PedeAqui Button system", () => {
  it("uses the canonical primary variant and medium size by default", () => {
    const markup = renderToStaticMarkup(createElement(Button, null, "Salvar"));
    expect(markup).toContain('data-tone="primary"');
    expect(markup).toContain('data-size="md"');
    expect(markup).not.toContain("disabled");
  });

  it("supports secondary, ghost and danger variants", () => {
    for (const tone of ["secondary", "ghost", "danger"] as const) {
      const markup = renderToStaticMarkup(createElement(Button, { tone }, tone));
      expect(markup).toContain(`data-tone="${tone}"`);
    }
  });

  it("turns loading into a disabled and announced busy state", () => {
    const markup = renderToStaticMarkup(createElement(Button, { loading: true, loadingLabel: "Salvando" }, "Salvar"));
    expect(markup).toContain("disabled");
    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('data-loading="true"');
    expect(markup).toContain("Salvando");
    expect(markup).toContain('aria-hidden="true"');
  });

  it("supports accessible icon-only actions", () => {
    const markup = renderToStaticMarkup(createElement(Button, { iconOnly: true, tone: "ghost", "aria-label": "Fechar" }, "×"));
    expect(markup).toContain('aria-label="Fechar"');
    expect(markup).toContain('data-icon-only="true"');
    expect(markup).toContain('data-tone="ghost"');
  });

  it("supports explicit small and large density without bypassing touch rules", () => {
    const small = renderToStaticMarkup(createElement(Button, { size: "sm" }, "Pequeno"));
    const large = renderToStaticMarkup(createElement(Button, { size: "lg" }, "Grande"));
    expect(small).toContain('data-size="sm"');
    expect(large).toContain('data-size="lg"');
    expect(css).toContain("@media (pointer: coarse)");
    expect(css).toContain("var(--control-height-lg)");
  });

  it("covers focus, pressed, disabled and reduced-motion behavior with design tokens only", () => {
    expect(css).toContain(":focus-visible");
    expect(css).toContain('[aria-pressed="true"]');
    expect(css).toContain(":disabled");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("var(--brand-primary)");
    expect(css).toContain("var(--state-danger)");
    expect(css).not.toMatch(/#[0-9a-f]{3,8}/i);
  });
});
