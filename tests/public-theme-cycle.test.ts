import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const component = readFileSync("src/features/theme/public-theme-cycle-button.tsx", "utf8");
const publicLayout = readFileSync("src/app/m/[slug]/layout.tsx", "utf8");
const rootLayout = readFileSync("src/app/layout.tsx", "utf8");

describe("public theme cycle", () => {
  it("reuses the canonical PedeAqui theme preference contract", () => {
    expect(rootLayout).toContain('const key = "pedeaqui-theme"');
    expect(rootLayout).toContain('preference === "light" || preference === "dark" || preference === "system"');
    expect(component).toContain('const STORAGE_KEY = "pedeaqui-theme"');
    expect(component).toContain('const cycleOrder: ThemePreference[] = ["system", "light", "dark"]');
    expect(component).toContain("root.dataset.themePreference = preference");
    expect(component).toContain('root.dataset.theme = preference === "system" ? systemTheme() : preference');
  });

  it("persists the customer choice and exposes one accessible cyclic button", () => {
    expect(component).toContain("localStorage.setItem(STORAGE_KEY, preference)");
    expect(component).toContain("aria-label={label}");
    expect(component).toContain("title={label}");
    expect(component).toContain("icons[preference]");
    expect(component).toContain("cycleTheme");
  });

  it("mounts once for the whole public store journey", () => {
    expect(publicLayout).toContain("PublicThemeCycleButton");
    expect(publicLayout).toContain("{children}");
  });
});
