import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const read = (relative: string) => fs.readFileSync(path.join(process.cwd(), relative), "utf8");

describe("desktop contextual navigation", () => {
  it("keeps the owner sidebar focused on the approved daily priorities plus More", () => {
    const navigation = read("src/components/layout/desktop-navigation.tsx");
    expect(navigation).toContain("Principal");
    expect(navigation).toContain("Mais ferramentas");
    expect(navigation).toContain("preferredPrimary");
    expect(navigation).toContain("easyPrimary");
    expect(navigation).not.toContain("Suprimentos");
    expect(navigation).not.toContain("Relacionamento");
  });

  it("marks the current route and supports an expanded/compact mode", () => {
    const navigation = read("src/components/layout/desktop-navigation.tsx");
    expect(navigation).toContain("usePathname()");
    expect(navigation).toContain('aria-current={active ? "page" : undefined}');
    expect(navigation).toContain("data-compact");
    expect(navigation).toContain("Recolher menu");
    expect(navigation).toContain("Expandir menu");
  });

  it("feeds the shell from existing RBAC instead of a hardcoded global list", () => {
    const layout = read("src/app/(app)/layout.tsx");
    const shell = read("src/components/layout/app-shell.tsx");
    expect(layout).toContain("NavigationAccessService.load()");
    expect(shell).toContain("navigationItems");
    expect(shell).toContain("<DesktopNavigation items={navigationItems}");
    expect(shell).not.toContain("export const navigation =");
  });

  it("keeps desktop focus and touch behavior explicit", () => {
    const css = read("src/app/shell.css");
    expect(css).toContain(".sidebar-toggle:focus-visible");
    expect(css).toContain('.app-nav-link[aria-current="page"]');
    expect(css).toContain("@media (pointer: coarse)");
    expect(css).toContain("overflow-y: auto");
  });
});
