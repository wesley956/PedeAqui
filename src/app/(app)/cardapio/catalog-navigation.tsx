"use client";

import Link from "next/link";
import { NavigationIcon } from "@/components/ui/navigation-icon";
import { usePathname } from "next/navigation";
import styles from "./catalog-management.module.css";

const links = [
  { label: "Disponibilidade", href: "/cardapio/disponibilidade", hint: "Ligar e desligar o que acabou", icon: "pin" },
  { label: "Produtos", href: "/cardapio/produtos", hint: "Itens, preços e disponibilidade", icon: "catalog" },
  { label: "Categorias", href: "/cardapio/categorias", hint: "Organização do cardápio", icon: "platform" },
  { label: "Sabores e Adicionais", href: "/cardapio/adicionais", hint: "Sabores, tamanhos e complementos", icon: "settings" },
  { label: "Sugestões", href: "/cardapio/sugestoes", hint: "Itens para acompanhar", icon: "growth" },
  { label: "Promoções", href: "/cardapio/promocoes", hint: "Ofertas por dia e horário", icon: "purchases" },
] as const;

export function CatalogNavigation() {
  const pathname = usePathname();
  return <nav className={styles.nav} aria-label="Gestão do cardápio">
    {links.map(({ label, href, hint, icon }) => {
      const active = pathname === href || pathname.startsWith(`${href}/`);
      return <Link key={href} href={href} className={styles.navLink} aria-current={active ? "page" : undefined}>
        <span className={styles.navIcon} aria-hidden><NavigationIcon name={icon} /></span>
        <span><strong className={styles.navTitle}>{label}</strong><small className={styles.navHint}>{hint}</small></span>
      </Link>;
    })}
  </nav>;
}
