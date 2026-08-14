import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const component = fs.readFileSync(path.join(root, "src/components/ui/status.tsx"), "utf8");
const css = fs.readFileSync(path.join(root, "src/components/ui/status.module.css"), "utf8");

describe("PedeAqui operational status language", () => {
  it("covers the core operational domains", () => {
    for (const prefix of ["order_", "payment_", "delivery_", "cash_", "inventory_", "generic_"]) {
      expect(component).toContain(prefix);
    }
  });

  it("always renders visible text and a non-color marker", () => {
    expect(component).toContain("definition.icon");
    expect(component).toContain("visibleLabel");
    expect(component).toContain('aria-hidden="true"');
    expect(component).toContain("aria-label={visibleLabel}");
  });

  it("maps every status to semantic tones instead of literal colors", () => {
    for (const tone of ["neutral", "info", "success", "warning", "danger"]) expect(css).toContain(`.${tone}`);
    expect(css).toContain("var(--state-success-text)");
    expect(css).toContain("var(--state-warning-text)");
    expect(css).toContain("var(--state-danger-text)");
    expect(css).not.toMatch(/#[0-9a-f]{3,8}/i);
  });

  it("distinguishes generic badges from operational status badges", () => {
    const primitives = fs.readFileSync(path.join(root, "src/components/ui/primitives.tsx"), "utf8");
    expect(primitives).toContain('StatusBadge, SemanticStatus');
    expect(primitives).toContain("Do not use this component for operational statuses");
  });
});
