"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import type { NavigationGroup } from "./navigation-model";

export type ShellNavigationItem = {
  key: string;
  label: string;
  href: string;
  group: NavigationGroup;
  priority: "primary" | "secondary";
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

export function DesktopNavigation({ items }: { items: readonly ShellNavigationItem[] }) {
  const pathname = usePathname();
  const [compact, setCompact] = useState(false);

  return (
    <div className="desktop-navigation" data-compact={compact ? "true" : "false"}>
      <button type="button" className="sidebar-toggle" onClick={() => setCompact((value) => !value)} aria-expanded={!compact}>
        <span aria-hidden>{compact ? "›" : "‹"}</span>
        <span className="sidebar-toggle-label">{compact ? "Expandir menu" : "Recolher menu"}</span>
      </button>
      <nav className="app-nav" aria-label="Navegação principal">
        {groups.map((group) => {
          const groupItems = items.filter((item) => item.group === group.key);
          if (groupItems.length === 0) return null;
          return (
            <section className="nav-group" key={group.key} aria-labelledby={`nav-group-${group.key}`}>
              <h2 className="nav-group-title" id={`nav-group-${group.key}`}>{group.label}</h2>
              <div className="nav-group-links">
                {groupItems.map((item) => {
                  const active = isActive(pathname, item.href);
                  return (
                    <Link
                      key={item.key}
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
                })}
              </div>
            </section>
          );
        })}
      </nav>
    </div>
  );
}
