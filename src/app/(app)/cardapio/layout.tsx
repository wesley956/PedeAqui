import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./catalog-management.module.css";

const links = [
  { label: "Produtos", href: "/cardapio/produtos", hint: "Preço, imagem e disponibilidade" },
  { label: "Categorias", href: "/cardapio/categorias", hint: "Ordem e organização do menu" },
  { label: "Adicionais", href: "/cardapio/adicionais", hint: "Grupos, opções e sabores" },
  { label: "Sugestões", href: "/cardapio/sugestoes", hint: "Bebidas e categorias para acompanhar" },
] as const;

export default function CatalogLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <nav className={`card ${styles.nav}`} aria-label="Gestão do cardápio">
        {links.map(({ label, href, hint }) => (
          <Link key={href} href={href} className={styles.navLink}>
            <span className={styles.navTitle}>{label}</span>
            <span className={styles.navHint}>{hint}</span>
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
