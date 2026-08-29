"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./catalog-management.module.css";

const links = [
  { label: "Produtos", href: "/cardapio/produtos", hint: "Itens, preços e disponibilidade", icon: "🍔" },
  { label: "Categorias", href: "/cardapio/categorias", hint: "Organização do cardápio", icon: "▦" },
  { label: "Adicionais", href: "/cardapio/adicionais", hint: "Opções e complementos", icon: "+" },
  { label: "Sugestões", href: "/cardapio/sugestoes", hint: "Itens para acompanhar", icon: "✨" },
] as const;

export function CatalogNavigation() {
  const pathname = usePathname();
  return <nav className={styles.nav} aria-label="Gestão do cardápio">
    {links.map(({ label, href, hint, icon }) => {
      const active = pathname === href || pathname.startsWith(`${href}/`);
      return <Link key={href} href={href} className={styles.navLink} aria-current={active ? "page" : undefined}>
        <span className={styles.navIcon} aria-hidden>{icon}</span>
        <span><strong className={styles.navTitle}>{label}</strong><small className={styles.navHint}>{hint}</small></span>
      </Link>;
    })}
  </nav>;
}
