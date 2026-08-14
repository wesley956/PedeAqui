import type { OperationalContext } from "./navigation-model";
import type { ShellNavigationItem } from "./desktop-navigation";

const contextPrecedence: readonly OperationalContext[] = [
  "kitchen",
  "delivery",
  "floor",
  "cashier",
  "service",
  "manager",
  "administrative",
  "management",
];

const startPreferences: Record<OperationalContext, readonly string[]> = {
  kitchen: ["production", "orders"],
  delivery: ["driver", "deliveries", "orders"],
  floor: ["dining", "orders", "pdv"],
  cashier: ["pdv", "cash", "orders"],
  service: ["conversations", "orders", "customers"],
  manager: ["orders", "dining", "dashboard"],
  administrative: ["catalog", "inventory", "settings", "dashboard"],
  management: ["dashboard", "orders", "cash", "finance"],
};

export function resolveOperationalStartRoute(contexts: readonly OperationalContext[], items: readonly ShellNavigationItem[]) {
  const available = new Map(items.filter((item) => item.priority !== "hidden").map((item) => [item.key, item.href]));
  const contextSet = new Set(contexts);

  for (const context of contextPrecedence) {
    if (!contextSet.has(context)) continue;
    for (const key of startPreferences[context]) {
      const href = available.get(key);
      if (href) return href;
    }
  }

  const primary = items.find((item) => item.priority === "primary");
  if (primary) return primary.href;
  const first = items.find((item) => item.priority !== "hidden");
  return first?.href ?? "/acesso-negado";
}
