import { describe, expect, it } from "vitest";
import { resolveOperationalStartRoute } from "@/components/layout/start-route";
import type { ShellNavigationItem } from "@/components/layout/desktop-navigation";

function item(key: string, href: string, priority: "primary" | "secondary" = "primary"): ShellNavigationItem {
  return { key, label: key, href, group: "operation", priority };
}

describe("operational start route", () => {
  it("sends management to dashboard when available", () => {
    expect(resolveOperationalStartRoute(["management"], [item("dashboard", "/dashboard")])).toBe("/dashboard");
  });

  it("sends cashier to PDV and floor to dining", () => {
    expect(resolveOperationalStartRoute(["cashier"], [item("pdv", "/pdv"), item("cash", "/caixa")])).toBe("/pdv");
    expect(resolveOperationalStartRoute(["floor"], [item("dining", "/salao"), item("orders", "/pedidos")])).toBe("/salao");
  });

  it("sends kitchen and delivery to their specialist surfaces", () => {
    expect(resolveOperationalStartRoute(["kitchen"], [item("production", "/producao")])).toBe("/producao");
    expect(resolveOperationalStartRoute(["delivery"], [item("driver", "/entregador")])).toBe("/entregador");
  });

  it("sends the financial role to finance before generic administration", () => {
    expect(resolveOperationalStartRoute(["administrative"], [
      item("dashboard", "/dashboard", "secondary"),
      item("catalog", "/cardapio/produtos"),
      item("finance", "/financeiro", "secondary"),
    ])).toBe("/financeiro");
  });

  it("uses deterministic specialist precedence for multi-role users", () => {
    const items = [item("dashboard", "/dashboard"), item("pdv", "/pdv"), item("dining", "/salao")];
    expect(resolveOperationalStartRoute(["management", "cashier"], items)).toBe("/pdv");
    expect(resolveOperationalStartRoute(["management", "cashier", "floor"], items)).toBe("/salao");
  });

  it("never selects a route that was filtered out by permissions", () => {
    expect(resolveOperationalStartRoute(["cashier"], [item("orders", "/pedidos")])).toBe("/pedidos");
  });

  it("falls back to an explicit no-access screen when navigation is empty", () => {
    expect(resolveOperationalStartRoute(["cashier"], [])).toBe("/acesso-negado");
  });
});
