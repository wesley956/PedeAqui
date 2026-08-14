import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

describe("full product accessibility QA [315]", () => {
  it("offers a keyboard skip link to the main application landmark", () => {
    const shell = read("src/components/layout/app-shell.tsx");
    const css = read("src/app/accessibility.css");
    expect(shell).toContain('href="#main-content"');
    expect(shell).toContain("Pular para o conteúdo principal");
    expect(shell).toContain('id="main-content"');
    expect(shell).toContain("tabIndex={-1}");
    expect(css).toContain(".skip-link:focus");
  });

  it("respects reduced-motion preferences globally", () => {
    const css = read("src/app/accessibility.css");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("scroll-behavior: auto !important");
    expect(css).toContain("transition-duration: 0.01ms !important");
  });

  it("keeps feedback announced with text as well as visual tone", () => {
    const feedback = read("src/components/ui/feedback.tsx");
    expect(feedback).toContain('role={urgent ? "alert" : "status"}');
    expect(feedback).toContain('aria-live={urgent ? "assertive" : "polite"}');
    expect(feedback).toContain('role="status" aria-live="polite"');
    expect(feedback).toContain('role="alert"');
  });

  it("keeps dialogs named and described for assistive technology", () => {
    const feedback = read("src/components/ui/feedback.tsx");
    expect(feedback).toContain("<dialog");
    expect(feedback).toContain("aria-labelledby={titleId}");
    expect(feedback).toContain("aria-describedby={description ? descriptionId : undefined}");
    expect(feedback).toContain("aria-label={closeLabel}");
  });

  it("keeps navigation position exposed independently from color", () => {
    const desktop = read("src/components/layout/desktop-navigation.tsx");
    const mobile = read("src/components/layout/mobile-navigation.tsx");
    expect(desktop).toContain('aria-current={active ? "page" : undefined}');
    expect(mobile).toContain('aria-current={active ? "page" : undefined}');
  });

  it("loads accessibility CSS after shell and mobile layout rules", () => {
    const layout = read("src/app/layout.tsx");
    expect(layout.indexOf('import "./accessibility.css"')).toBeGreaterThan(layout.indexOf('import "./mobile.css"'));
  });
});
