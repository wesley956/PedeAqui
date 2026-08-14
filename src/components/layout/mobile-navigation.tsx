"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { OperationalContext } from "./navigation-model";
import type { ShellNavigationItem } from "./desktop-navigation";

const preferredOrder: Record<OperationalContext, readonly string[]> = {
  management: ["dashboard", "orders", "cash", "finance"],
  manager: ["orders", "dining", "production", "deliveries"],
  cashier: ["pdv", "cash", "orders", "customers"],
  service: ["conversations", "orders", "customers", "pdv"],
  floor: ["dining", "orders", "pdv", "customers"],
  kitchen: ["production", "orders"],
  delivery: ["driver", "deliveries", "orders"],
  administrative: ["catalog", "inventory", "purchases", "settings"],
};

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
}

function mobileLabel(item: ShellNavigationItem, contexts: readonly OperationalContext[]) {
  if (item.key === "dining" && contexts.includes("floor")) return "Mesas";
  if (item.key === "pdv" && contexts.includes("floor")) return "Novo";
  if (item.key === "driver" && contexts.includes("delivery")) return "Roteiro";
  return item.label;
}

export function selectMobileNavigation(items: readonly ShellNavigationItem[], contexts: readonly OperationalContext[], limit = 4) {
  const visible = items.filter((item) => item.priority !== "hidden");
  const byKey = new Map(visible.map((item) => [item.key, item]));
  const orderedKeys = [...new Set(contexts.flatMap((context) => preferredOrder[context]))];
  const selected: ShellNavigationItem[] = [];

  for (const key of orderedKeys) {
    const item = byKey.get(key);
    if (item && !selected.some((entry) => entry.key === item.key)) selected.push(item);
    if (selected.length === limit) break;
  }

  if (selected.length < limit) {
    for (const item of visible.filter((entry) => entry.priority === "primary")) {
      if (!selected.some((entry) => entry.key === item.key)) selected.push(item);
      if (selected.length === limit) break;
    }
  }

  if (selected.length < limit) {
    for (const item of visible) {
      if (!selected.some((entry) => entry.key === item.key)) selected.push(item);
      if (selected.length === limit) break;
    }
  }

  const selectedKeys = new Set(selected.map((item) => item.key));
  const more = visible.filter((item) => !selectedKeys.has(item.key));
  return { selected, more };
}

export function MobileNavigation({ items, contexts }: { items: readonly ShellNavigationItem[]; contexts: readonly OperationalContext[] }) {
  const pathname = usePathname();
  const { selected, more } = selectMobileNavigation(items, contexts);

  return (
    <nav className="mobile-nav" aria-label="Navegação principal mobile">
      {selected.map((item) => {
        const active = isActive(pathname, item.href);
        return <Link key={item.key} href={item.href} aria-current={active ? "page" : undefined}>{mobileLabel(item, contexts)}</Link>;
      })}
      {more.length > 0 ? (
        <details className="mobile-more">
          <summary aria-label="Abrir mais opções">Mais</summary>
          <div className="mobile-more-panel">
            {more.map((item) => {
              const active = isActive(pathname, item.href);
              return <Link key={item.key} href={item.href} aria-current={active ? "page" : undefined}>{item.label}</Link>;
            })}
          </div>
        </details>
      ) : null}
    </nav>
  );
}
