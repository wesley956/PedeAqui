import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const selector = readFileSync("src/components/theme/theme-selector.tsx", "utf8");
const styles = readFileSync("src/components/theme/theme-selector.module.css", "utf8");
const layout = readFileSync("src/app/layout.tsx", "utf8");

describe("theme selector icons [334]", () => {
  it("uses three accessible buttons instead of a select", () => {
    expect(selector).not.toContain("<select");
    expect(selector).toContain('value: "light", label: "Claro"');
    expect(selector).toContain('value: "system", label: "Automático"');
    expect(selector).toContain('value: "dark", label: "Escuro"');
    expect(selector).toContain('role="group"');
    expect(selector).toContain("aria-pressed={selected}");
  });

  it("renders dedicated SVGs for sun, automatic fusion and moon", () => {
    expect(selector).toContain("function SunIcon()");
    expect(selector).toContain("function AutomaticIcon()");
    expect(selector).toContain("function MoonIcon()");
    expect(selector.match(/<svg/g)?.length).toBeGreaterThanOrEqual(3);
  });

  it("preserves persistence and live system preference", () => {
    expect(selector).toContain('window.localStorage.setItem(STORAGE_KEY, value)');
    expect(selector).toContain('window.matchMedia(darkModeQuery)');
    expect(selector).toContain('media.addEventListener("change", handleSystemChange)');
    expect(selector).toContain('media.removeEventListener("change", handleSystemChange)');
    expect(layout).toContain('strategy="beforeInteractive"');
    expect(layout).toContain('root.dataset.themePreference === "system"');
  });

  it("has selected and keyboard focus states for compact and settings modes", () => {
    expect(styles).toContain('.option[data-selected="true"]');
    expect(styles).toContain(".option:focus-visible");
    expect(styles).toContain(".compact .option");
    expect(styles).toContain(".card .segmented");
  });
});
