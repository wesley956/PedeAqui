import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const component = fs.readFileSync(path.join(root, "src/components/ui/card.tsx"), "utf8");
const css = fs.readFileSync(path.join(root, "src/components/ui/card.module.css"), "utf8");

describe("PedeAqui card system", () => {
  it("defines the documented card variants and densities", () => {
    for (const kind of ["operational", "informational", "kpi", "order", "product", "table", "customer", "alert"]) expect(component).toContain(kind);
    for (const density of ["compact", "standard", "comfortable"]) expect(component).toContain(density);
  });

  it("provides composable header, body, actions and KPI value", () => {
    for (const name of ["CardHeader", "CardBody", "CardActions", "KpiValue"]) expect(component).toContain(`function ${name}`);
  });

  it("uses official tokens and responsive behavior", () => {
    expect(css).toContain("var(--surface-1)");
    expect(css).toContain("var(--state-warning-surface)");
    expect(css).toContain("var(--shadow-sm)");
    expect(css).toContain("@media (max-width: 640px)");
    expect(css).not.toMatch(/#[0-9a-f]{3,8}/i);
  });

  it("keeps the legacy Card export pointed at the canonical implementation", () => {
    const primitives = fs.readFileSync(path.join(root, "src/components/ui/primitives.tsx"), "utf8");
    expect(primitives).toContain('export { Card } from "./card"');
  });
});
