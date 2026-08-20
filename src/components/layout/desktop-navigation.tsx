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

const groups: readonly { key: NavigationGroup; label: string }[] = [
  { key: "operation", label: "Operação" },
  { key: "management", label: "Gestão" },
  { key: "supplies", label: "Suprimentos" },
  { key: "relationship", label: "Relacionamento" },
  { key: "administration", label: "Administração" },
];

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
      <span className="nav-link-marker" aria-hidden>{item.label.slice(0, 1)}</span>
      <span className="nav-link-label">{item.label}</span>
    </Link>
  );
}

export function DesktopNavigation({ items, experienceMode = "standard" }: { items: readonly ShellNavigationItem[]; experienceMode?: ExperienceMode }) {
  const pathname = usePathname();
  const [compact, setCompact] = useState(false);
  const easyPrimary = items.filter((item) => item.priority !== "hidden" && item.easyPrimary);
  const easyMore = items.filter((item) => item.priority !== "hidden" && !item.easyPrimary);

  return (
    <div className="desktop-navigation" data-compact={compact ? "true" : "false"} data-experience={experienceMode}>
      <button type="button" className="sidebar-toggle" onClick={() => setCompact((value) => !value)} aria-expanded={!compact}>
        <span aria-hidden>{compact ? "›" : "‹"}</span>
        <span className="sidebar-toggle-label">{compact ? "Expandir menu" : "Recolher menu"}</span>
      </button>
      <nav className="app-nav" aria-label="Navegação principal">
        {experienceMode === "easy" ? (
          <>
            <section className="nav-group" aria-labelledby="nav-group-easy">
              <h2 className="nav-group-title" id="nav-group-easy">Atalhos</h2>
              <div className="nav-group-links">
                {easyPrimary.map((item) => <NavigationLink key={item.key} item={item} compact={compact} pathname={pathname} />)}
              </div>
            </section>
            {easyMore.length > 0 ? (
              <details className="nav-group">
                <summary className="nav-group-title">Mais ferramentas</summary>
                <div className="nav-group-links">
                  {easyMore.map((item) => <NavigationLink key={item.key} item={item} compact={compact} pathname={pathname} />)}
                </div>
              </details>
            ) : null}
          </>
        ) : groups.map((group) => {
          const groupItems = items.filter((item) => item.group === group.key && item.priority !== "hidden");
          if (groupItems.length === 0) return null;
          return (
            <section className="nav-group" key={group.key} aria-labelledby={`nav-group-${group.key}`}>
              <h2 className="nav-group-title" id={`nav-group-${group.key}`}>{group.label}</h2>
              <div className="nav-group-links">
                {groupItems.map((item) => <NavigationLink key={item.key} item={item} compact={compact} pathname={pathname} />)}
              </div>
            </section>
          );
        })}
      </nav>
    </div>
  );
}
