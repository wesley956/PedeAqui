"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { ExperienceMode } from "@/modules/user-experience";
import type { NavigationGroup, NavigationPriority } from "./navigation-model";

export type ShellNavigationItem = {
  key: string;
  label: string;
  href: string;
  group: NavigationGroup;
  priority: NavigationPriority;
  easyPrimary?: boolean;
};

const icons: Record<string, string> = {
  dashboard: "⌂",
  orders: "▤",
  conversations: "◌",
  dining: "▦",
  catalog: "☷",
  pdv: "▣",
  cash: "$",
  finance: "↗",
  fiscal: "§",
  production: "◫",
  deliveries: "➜",
  driver: "⌁",
  inventory: "□",
  gas_containers: "◉",
  suppliers: "◇",
  purchases: "▥",
  customers: "◎",
  growth: "↟",
  scale: "◷",
  team: "♙",
  settings: "⚙",
  platform: "◆",
};

function isActive(pathname: string, href: string) {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
}

function NavigationLink({ item, compact, pathname }: { item: ShellNavigationItem; compact: boolean; pathname: string }) {
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      className="app-nav-link"
      data-priority={item.priority}
      aria-current={active ? "page" : undefined}
      title={compact ? item.label : undefined}
    >
      <span className="nav-link-marker" aria-hidden>{icons[item.key] ?? item.label.slice(0, 1)}</span>
      <span className="nav-link-label">{item.key === "dashboard" ? "Início" : item.label}</span>
    </Link>
  );
}

export function DesktopNavigation({ items, experienceMode = "standard" }: { items: readonly ShellNavigationItem[]; experienceMode?: ExperienceMode }) {
  const pathname = usePathname();
  const [compact, setCompact] = useState(false);
  const visible = items.filter((item) => item.priority !== "hidden");
  const preferredPrimary = visible.filter((item) => item.easyPrimary);
  const primary = preferredPrimary.length > 0 ? preferredPrimary : visible.filter((item) => item.priority === "primary").slice(0, 6);
  const primaryKeys = new Set(primary.map((item) => item.key));
  const more = visible.filter((item) => !primaryKeys.has(item.key));
  const moreActive = pathname === "/mais-ferramentas" || more.some((item) => isActive(pathname, item.href));

  return (
    <div className="desktop-navigation" data-compact={compact ? "true" : "false"} data-experience={experienceMode}>
      <button type="button" className="sidebar-toggle" onClick={() => setCompact((value) => !value)} aria-expanded={!compact}>
        <span aria-hidden>{compact ? "›" : "‹"}</span>
        <span className="sidebar-toggle-label">{compact ? "Expandir menu" : "Recolher menu"}</span>
      </button>
      <nav className="app-nav" aria-label="Navegação principal">
        <section className="nav-group" aria-labelledby="nav-group-main">
          <h2 className="nav-group-title" id="nav-group-main">Principal</h2>
          <div className="nav-group-links">
            {primary.map((item) => <NavigationLink key={item.key} item={item} compact={compact} pathname={pathname} />)}
          </div>
        </section>
        {more.length > 0 ? (
          <section className="nav-group" aria-labelledby="nav-group-more">
            <h2 className="nav-group-title" id="nav-group-more">Organização</h2>
            <div className="nav-group-links">
              <Link href="/mais-ferramentas" className="app-nav-link" aria-current={moreActive ? "page" : undefined} title={compact ? "Mais ferramentas" : undefined}>
                <span className="nav-link-marker" aria-hidden>•••</span>
                <span className="nav-link-label">Mais ferramentas</span>
              </Link>
            </div>
          </section>
        ) : null}
      </nav>
    </div>
  );
}
