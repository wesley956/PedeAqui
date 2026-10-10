"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
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
      aria-label={compact ? (item.key === "dashboard" ? "Início" : item.label) : undefined}
      title={compact ? item.label : undefined}
    >
      <span className="nav-link-marker" aria-hidden>{icons[item.key] ?? item.label.slice(0, 1)}</span>
      <span className="nav-link-label">{item.key === "dashboard" ? "Início" : item.label}</span>
    </Link>
  );
}

export function DesktopNavigation({ items, experienceMode = "standard", children }: { items: readonly ShellNavigationItem[]; experienceMode?: ExperienceMode; children?: ReactNode }) {
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
      <div className="sidebar-heading">
        <button type="button" className="sidebar-toggle" onClick={() => setCompact((value) => !value)} aria-expanded={!compact} aria-controls="desktop-main-navigation" aria-label={compact ? "Expandir menu" : "Recolher menu"} title={compact ? "Expandir menu" : "Recolher menu"}>
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M9 4v16" />
            <path d={compact ? "m13 9 3 3-3 3" : "m16 9-3 3 3 3"} />
          </svg>
        </button>
        {children}
      </div>
      <nav id="desktop-main-navigation" className="app-nav" aria-label="Navegação principal">
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
              <Link href="/mais-ferramentas" className="app-nav-link" aria-current={moreActive ? "page" : undefined} aria-label={compact ? "Mais ferramentas" : undefined} title={compact ? "Mais ferramentas" : undefined}>
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
