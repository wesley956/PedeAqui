import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { pinnedNavigationItems, sanitizeNavigationPins } from "@/components/layout/navigation-model";
import { selectMobileNavigation } from "@/components/layout/mobile-navigation";
import type { ShellNavigationItem } from "@/components/layout/desktop-navigation";

const read = (path: string) => readFileSync(path, "utf8");

const items: ShellNavigationItem[] = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard", group: "management", priority: "primary" },
  { key: "orders", label: "Pedidos", href: "/pedidos", group: "operation", priority: "primary" },
  { key: "catalog", label: "Cardápio", href: "/cardapio/produtos", group: "operation", priority: "primary" },
  { key: "pdv", label: "PDV", href: "/pdv", group: "operation", priority: "primary" },
  { key: "cash", label: "Caixa", href: "/caixa", group: "operation", priority: "secondary" },
  { key: "finance", label: "Financeiro", href: "/financeiro", group: "management", priority: "secondary" },
];

describe("menu personalizável", () => {
  it("keeps only visible, unique keys in the chosen order and within the limit", () => {
    const allowed = new Set(items.map((item) => item.key));
    expect(sanitizeNavigationPins(["cash", "orders", "cash", "platform", 42, "finance"], allowed)).toEqual(["cash", "orders", "finance"]);
    expect(sanitizeNavigationPins(["cash", "orders", "finance"], allowed, 2)).toEqual(["cash", "orders"]);
    expect(sanitizeNavigationPins(null, allowed)).toEqual([]);
    expect(sanitizeNavigationPins("orders", allowed)).toEqual([]);
  });

  it("orders pinned items by the user's position and ignores unpinned ones", () => {
    const pinned = items.map((item) => ({ ...item, pinnedOrder: item.key === "cash" ? 0 : item.key === "orders" ? 1 : null }));
    expect(pinnedNavigationItems(pinned).map((item) => item.key)).toEqual(["cash", "orders"]);
  });

  it("puts the first pinned items in the mobile bar, in the user's order", () => {
    const pinned = items.map((item) => ({ ...item, pinnedOrder: ({ finance: 0, cash: 1, orders: 2 } as Record<string, number>)[item.key] ?? null }));
    const mobile = selectMobileNavigation(pinned, ["management"]);
    expect(mobile.selected.map((item) => item.key)).toEqual(["finance", "cash", "orders"]);
    expect([...mobile.selected, ...mobile.more]).toHaveLength(items.length);
  });

  it("falls back to the role defaults when nothing is pinned", () => {
    const mobile = selectMobileNavigation(items, ["management"]);
    expect(mobile.selected.map((item) => item.key)).toEqual(["dashboard", "orders", "catalog", "pdv"]);
  });

  it("stores the preference per user and store, and only accepts items the user can see", () => {
    const actions = read("src/features/preferences/navigation-actions.ts");
    const service = read("src/server/preferences/navigation-preference-service.ts");
    const migration = read("supabase/sql/230_user_navigation_pins.sql");
    expect(actions).toContain("sanitizeNavigationPins(keys, allowed, NAVIGATION_PIN_LIMIT)");
    expect(service).toContain('.eq("user_id", context.userId)');
    expect(service).toContain('onConflict: "store_id,user_id"');
    expect(migration).toContain("add column if not exists navigation_pins text[]");
    expect(migration).toContain("cardinality(navigation_pins) <= 12");
  });

  it("offers drag-and-drop plus keyboard/touch reordering and a way back to the default", () => {
    const editor = read("src/app/(app)/meu-menu/menu-customizer.tsx");
    expect(editor).toContain("draggable");
    expect(editor).toContain("onDrop");
    expect(editor).toContain("Subir");
    expect(editor).toContain("Descer");
    expect(editor).toContain("Restaurar padrão");
    expect(read("src/components/layout/desktop-navigation.tsx")).toContain('href="/meu-menu"');
  });
});
