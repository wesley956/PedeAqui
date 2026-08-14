import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const component = fs.readFileSync(path.join(root, "src/components/ui/data-list.tsx"), "utf8");
const css = fs.readFileSync(path.join(root, "src/components/ui/data-list.module.css"), "utf8");

describe("PedeAqui responsive listing system", () => {
  it("provides toolbar, responsive data list and pagination", () => {
    for (const name of ["ListToolbar", "ResponsiveDataList", "ListPagination"]) expect(component).toContain(`function ${name}`);
  });

  it("renders semantic desktop tables and complete mobile cards", () => {
    expect(component).toContain("<table");
    expect(component).toContain("<caption");
    expect(component).toContain('scope="col"');
    expect(component).toContain('role="list"');
    expect(component).toContain('role="listitem"');
    expect(component).toContain("columns.map");
  });

  it("integrates loading, error and empty states", () => {
    expect(component).toContain("LoadingState");
    expect(component).toContain("ErrorState");
    expect(component).toContain("EmptyState");
  });

  it("covers mobile conversion, numeric alignment and focus", () => {
    expect(css).toContain("@media (max-width: 640px)");
    expect(css).toContain("font-variant-numeric: tabular-nums");
    expect(css).toContain(":focus-within");
    expect(css).toContain("var(--focus-ring)");
  });
});
