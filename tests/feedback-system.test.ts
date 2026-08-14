import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const component = fs.readFileSync(path.join(root, "src/components/ui/feedback.tsx"), "utf8");
const css = fs.readFileSync(path.join(root, "src/components/ui/feedback.module.css"), "utf8");

describe("PedeAqui feedback system", () => {
  it("exports the shared feedback and state components", () => {
    for (const name of ["Alert", "Toast", "Dialog", "ConfirmDialog", "EmptyState", "LoadingState", "ErrorState", "SuccessState", "Skeleton"]) expect(component).toContain(`function ${name}`);
  });

  it("covers live regions, dialog focus lifecycle and dismissal", () => {
    expect(component).toContain("aria-live");
    expect(component).toContain("showModal()");
    expect(component).toContain('addEventListener("cancel"');
    expect(component).toContain("onDismiss");
    expect(component).toContain('aria-label={dismissLabel}');
  });

  it("uses semantic tokens, responsive layout and reduced motion", () => {
    expect(css).toContain("var(--state-danger-surface)");
    expect(css).toContain("var(--shadow-lg)");
    expect(css).toContain("@media (max-width: 640px)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).not.toMatch(/#[0-9a-f]{3,8}/i);
  });

  it("routes legacy EmptyState and Skeleton exports to the canonical system", () => {
    const primitives = fs.readFileSync(path.join(root, "src/components/ui/primitives.tsx"), "utf8");
    expect(primitives).toContain('export { EmptyState, Skeleton } from "./feedback"');
  });
});
