import type { ReactNode } from "react";
import { CatalogNavigation } from "./catalog-navigation";
import styles from "./catalog-management.module.css";

export default function CatalogLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <header className={styles.catalogHeader}>
        <div><h1>Cardápio</h1></div>
      </header>
      <CatalogNavigation />
      {children}
    </div>
  );
}
