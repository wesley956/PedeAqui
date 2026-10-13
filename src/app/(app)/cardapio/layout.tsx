import type { ReactNode } from "react";
import { CatalogNavigation } from "./catalog-navigation";
import styles from "./catalog-management.module.css";
import { PageHeader } from "@/components/ui/page-header";

export default function CatalogLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <PageHeader title="Cardápio" />
      <CatalogNavigation />
      {children}
    </div>
  );
}
