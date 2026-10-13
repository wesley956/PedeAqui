import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./printing-settings-layout.module.css";
import { NavigationIcon } from "@/components/ui/navigation-icon";

export default function PrintingSettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <nav className={styles.nav} aria-label="Configurações de impressão">
        <Link className={styles.link} href="/configuracoes/impressoes"><NavigationIcon name="printing" /> Conexão e impressoras</Link>
        <Link className={styles.link} href="/configuracoes/impressoes/gerenciar"><NavigationIcon name="integrations" /> Gerenciar impressoras</Link>
        <Link className={styles.link} href="/configuracoes/impressoes/formato"><NavigationIcon name="receipt" /> Formato e vias</Link>
      </nav>
      {children}
    </div>
  );
}
