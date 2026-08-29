import type { ReactNode } from "react";
import { CatalogNavigation } from "./catalog-navigation";
import styles from "./catalog-management.module.css";

export default function CatalogLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <header className={styles.catalogHeader}>
        <div><p className={styles.eyebrow}>CARDÁPIO</p><h1>Organize o que você vende</h1><p>Produtos, categorias, adicionais e sugestões em um só lugar.</p></div>
      </header>
      <CatalogNavigation />
      {children}
    </div>
  );
}
