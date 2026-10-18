"use client";

import Link from "next/link";
import { NavigationIcon } from "@/components/ui/navigation-icon";
import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore, type ReactNode } from "react";
import type { ExperienceMode } from "@/modules/user-experience";
import { pinnedNavigationItems, type NavigationGroup, type NavigationPriority } from "./navigation-model";

export type ShellNavigationItem = {
  key: string;
  label: string;
  href: string;
  group: NavigationGroup;
  priority: NavigationPriority;
  easyPrimary?: boolean;
  /** Posição escolhida pelo usuário em "Personalizar menu"; ausente/null = item não fixado. */
  pinnedOrder?: number | null;
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
      <span className="nav-link-marker" aria-hidden><NavigationIcon name={item.key} /></span>
      <span className="nav-link-label">{item.key === "dashboard" ? "Início" : item.label}</span>
    </Link>
  );
}

type SecondarySection = { key: string; title: string; items: readonly ShellNavigationItem[] };

// Preferência "grupo aberto/fechado" guardada por navegador. Sem armazenamento, o grupo começa recolhido.
const NAVIGATION_GROUPS_EVENT = "pedeaqui:navigation-groups";

function subscribeNavigationGroups(onChange: () => void) {
  window.addEventListener(NAVIGATION_GROUPS_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(NAVIGATION_GROUPS_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readGroupExpanded(storageKey: string) {
  try { return window.localStorage.getItem(storageKey) === "open"; } catch { return false; }
}

function writeGroupExpanded(storageKey: string, expanded: boolean) {
  try { window.localStorage.setItem(storageKey, expanded ? "open" : "closed"); } catch { /* sem persistência */ }
  window.dispatchEvent(new Event(NAVIGATION_GROUPS_EVENT));
}

/**
 * Sidebar em três grupos sempre visíveis: o que a função usa todo dia ("Principal"), as áreas de
 * gestão e a conta/ajustes. Os grupos secundários podem ser recolhidos, mas abrem sozinhos quando a
 * página atual está dentro deles. Não existe mais a gaveta única "Mais ferramentas" no menu lateral:
 * a página /mais-ferramentas continua existindo para o celular e para links antigos.
 */
function NavigationSection({ section, compact, pathname }: { section: SecondarySection; compact: boolean; pathname: string }) {
  const hasActive = section.items.some((item) => isActive(pathname, item.href));
  const storageKey = `pedeaqui.nav.${section.key}`;
  const expanded = useSyncExternalStore(subscribeNavigationGroups, () => readGroupExpanded(storageKey), () => false);
  const toggle = () => writeGroupExpanded(storageKey, !expanded);
  const open = compact || hasActive || expanded;
  const titleId = `nav-group-${section.key}`;
  const linksId = `nav-group-links-${section.key}`;
  return (
    <section className="nav-group" aria-labelledby={titleId}>
      <h2 className="nav-group-title">
        <button type="button" id={titleId} className="nav-group-toggle" aria-expanded={open} aria-controls={linksId} onClick={toggle}>
          <span>{section.title}</span>
          <span aria-hidden="true" className="nav-group-chevron">{open ? "\u2212" : "+"}</span>
        </button>
      </h2>
      <div className="nav-group-links" id={linksId} data-collapsed={open ? "false" : "true"}>
        {section.items.map((item) => <NavigationLink key={item.key} item={item} compact={compact} pathname={pathname} />)}
      </div>
    </section>
  );
}

export function DesktopNavigation({ items, experienceMode = "standard", children }: { items: readonly ShellNavigationItem[]; experienceMode?: ExperienceMode; children?: ReactNode }) {
  const pathname = usePathname();
  const [compact, setCompact] = useState(false);
  const visible = items.filter((item) => item.priority !== "hidden");
  // Ordem de decisão do grupo Principal: o que o usuário fixou > modo fácil > padrão da função.
  const pinned = pinnedNavigationItems(visible);
  const preferredPrimary = visible.filter((item) => item.easyPrimary);
  const primary = pinned.length > 0 ? pinned : preferredPrimary.length > 0 ? preferredPrimary : visible.filter((item) => item.priority === "primary").slice(0, 8);
  const primaryKeys = new Set(primary.map((item) => item.key));
  const rest = visible.filter((item) => !primaryKeys.has(item.key));
  const sections: SecondarySection[] = [
    { key: "management", title: "Gestão", items: rest.filter((item) => item.group !== "administration") },
    { key: "account", title: "Conta e ajustes", items: rest.filter((item) => item.group === "administration") },
  ].filter((section) => section.items.length > 0);

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
        {sections.map((section) => <NavigationSection key={section.key} section={section} compact={compact} pathname={pathname} />)}
        <Link href="/meu-menu" className="app-nav-link nav-customize-link" aria-current={pathname === "/meu-menu" ? "page" : undefined} aria-label={compact ? "Personalizar menu" : undefined} title="Escolher e ordenar os itens do menu">
          <span className="nav-link-marker" aria-hidden><NavigationIcon name="pin" /></span>
          <span className="nav-link-label">Personalizar menu</span>
        </Link>
      </nav>
    </div>
  );
}
