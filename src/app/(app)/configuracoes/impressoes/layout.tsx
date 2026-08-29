import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./printing-settings-layout.module.css";

export default function PrintingSettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <nav className={styles.nav} aria-label="Configurações de impressão">
        <Link className={styles.link} href="/configuracoes/impressoes">🖨️ Conexão e impressoras</Link>
        <Link className={styles.link} href="/configuracoes/impressoes/formato">🧾 Formato e vias</Link>
      </nav>
      {children}
    </div>
  );
}
