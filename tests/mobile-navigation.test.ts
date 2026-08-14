import { describe, expect, it } from "vitest";
import { selectMobileNavigation } from "@/components/layout/mobile-navigation";
import type { ShellNavigationItem } from "@/components/layout/desktop-navigation";

const items: ShellNavigationItem[] = [
  { key: "dashboard", label: "Dashboard", href: "/dashboard", group: "management", priority: "secondary" },
  { key: "orders", label: "Pedidos", href: "/pedidos", group: "operation", priority: "primary" },
  { key: "dining", label: "Salão", href: "/salao", group: "operation", priority: "primary" },
  { key: "pdv", label: "PDV", href: "/pdv", group: "operation", priority: "secondary" },
  { key: "customers", label: "Clientes", href: "/clientes", group: "relationship", priority: "secondary" },
  { key: "settings", label: "Configurações", href: "/configuracoes", group: "administration", priority: "secondary" },
];

describe("mobile contextual navigation", () => {
  it("prioritizes the floor workflow deterministically", () => {
    const result = selectMobileNavigation(items, ["floor"]);
    expect(result.selected.map((item) => item.key)).toEqual(["dining", "orders", "pdv", "customers"]);
    expect(result.more.map((item) => item.key)).toEqual(["dashboard", "settings"]);
  });

  it("never puts more than four direct actions before More", () => {
    expect(selectMobileNavigation(items, ["management"], 4).selected).toHaveLength(4);
  });

  it("does not surface hidden modules", () => {
    const hidden = [{ key: "finance", label: "Financeiro", href: "/financeiro", group: "management", priority: "hidden" as const }];
    expect(selectMobileNavigation([...items, ...hidden], ["floor"]).more.some((item) => item.key === "finance")).toBe(false);
  });
});
