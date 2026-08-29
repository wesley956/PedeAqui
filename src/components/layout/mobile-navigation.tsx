"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ExperienceMode } from "@/modules/user-experience";
import type { OperationalContext } from "./navigation-model";
import type { ShellNavigationItem } from "./desktop-navigation";

const preferredOrder: Record<OperationalContext, readonly string[]> = {
  management: ["dashboard", "orders", "catalog", "pdv"],
  manager: ["orders", "dining", "production", "deliveries"],
  cashier: ["pdv", "cash", "orders", "customers"],
  service: ["conversations", "orders", "customers", "pdv"],
  floor: ["dining", "orders", "pdv", "customers"],
  kitchen: ["production", "orders"],
  delivery: ["driver", "deliveries", "orders"],
  administrative: ["catalog", "inventory", "purchases", "settings"],
};

const icons: Record<string, string> = {
  dashboard: "⌂", orders: "▤", catalog: "☷", pdv: "▣", cash: "$", customers: "◎", conversations: "◌",
  dining: "▦", production: "◫", deliveries: "➜", driver: "⌁", inventory: "□", purchases: "▥", settings: "⚙",
};

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
}

function mobileLabel(item: ShellNavigationItem, contexts: readonly OperationalContext[]) {
  if (item.key === "dashboard") return "Início";
  if (item.key === "catalog") return "Cardápio";
  if (item.key === "dining" && contexts.includes("floor")) return "Mesas";
  if (item.key === "pdv" && contexts.includes("floor")) return "Novo";
  if (item.key === "driver" && contexts.includes("delivery")) return "Roteiro";
  return item.label;
}

export function selectMobileNavigation(
  items: readonly ShellNavigationItem[],
  contexts: readonly OperationalContext[],
  limit = 4,
  experienceMode: ExperienceMode = "standard",
) {
  const visible = items.filter((item) => item.priority !== "hidden");
  if (experienceMode === "easy") {
    const selected = visible.filter((item) => item.easyPrimary).slice(0, limit);
    const selectedKeys = new Set(selected.map((item) => item.key));
    return { selected, more: visible.filter((item) => !selectedKeys.has(item.key)) };
  }

  const byKey = new Map(visible.map((item) => [item.key, item]));
  const orderedKeys = [...new Set(contexts.flatMap((context) => preferredOrder[context]))];
  const selected: ShellNavigationItem[] = [];
  for (const key of orderedKeys) {
    const item = byKey.get(key);
    if (item && !selected.some((entry) => entry.key === item.key)) selected.push(item);
    if (selected.length === limit) break;
  }
  if (selected.length < limit) for (const item of visible.filter((entry) => entry.priority === "primary")) {
    if (!selected.some((entry) => entry.key === item.key)) selected.push(item);
    if (selected.length === limit) break;
  }
  if (selected.length < limit) for (const item of visible) {
    if (!selected.some((entry) => entry.key === item.key)) selected.push(item);
    if (selected.length === limit) break;
  }
  const selectedKeys = new Set(selected.map((item) => item.key));
  return { selected, more: visible.filter((item) => !selectedKeys.has(item.key)) };
}

export function MobileNavigation({ items, contexts, experienceMode = "standard" }: { items: readonly ShellNavigationItem[]; contexts: readonly OperationalContext[]; experienceMode?: ExperienceMode }) {
  const pathname = usePathname();
  const { selected, more } = selectMobileNavigation(items, contexts, 4, experienceMode);
  const moreActive = pathname === "/mais-ferramentas" || more.some((item) => isActive(pathname, item.href));

  return (
    <nav className="mobile-nav" aria-label="Navegação principal mobile" data-experience={experienceMode}>
      {selected.map((item) => {
        const active = isActive(pathname, item.href);
        return <Link key={item.key} href={item.href} aria-current={active ? "page" : undefined}><span className="mobile-nav-icon" aria-hidden>{icons[item.key] ?? "•"}</span><span>{mobileLabel(item, contexts)}</span></Link>;
      })}
      {more.length > 0 ? <details className="mobile-more"><summary aria-label="Abrir mais opções" aria-current={moreActive ? "page" : undefined}><span className="mobile-nav-icon" aria-hidden>•••</span><span>Mais</span></summary><div className="mobile-more-panel">
        <Link href="/mais-ferramentas" aria-current={pathname === "/mais-ferramentas" ? "page" : undefined}>Todas as ferramentas</Link>
        {more.map((item) => {
          const active = isActive(pathname, item.href);
          return <Link key={item.key} href={item.href} aria-current={active ? "page" : undefined}>{item.label}</Link>;
        })}
      </div></details> : null}
    </nav>
  );
}
