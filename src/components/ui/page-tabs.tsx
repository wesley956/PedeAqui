import Link from "next/link";
import styles from "./page-tabs.module.css";

export type PageTab = { key: string; label: string; href: string; count?: number | null };

/**
 * Abas de uma página longa (Financeiro, Crescimento, Pagamentos, Pedidos...). Cada aba é um link,
 * então funciona sem JavaScript, pode ser favoritada e o botão voltar do navegador respeita a aba.
 */
export function PageTabs({ tabs, active, label }: { tabs: readonly PageTab[]; active: string; label: string }) {
  return (
    <nav className={styles.tabs} aria-label={label}>
      {tabs.map((tab) => (
        <Link key={tab.key} href={tab.href} className={styles.tab} aria-current={tab.key === active ? "page" : undefined}>
          {tab.label}
          {tab.count ? <span className={styles.count}>{tab.count}</span> : null}
        </Link>
      ))}
    </nav>
  );
}
