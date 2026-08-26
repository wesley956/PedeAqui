import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./legal-page.module.css";

export function LegalPage({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <main className={styles.root}>
      <div className={styles.shell}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>PedeAqui</p>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.subtitle}>{subtitle}</p>
        </header>

        <article className={styles.card}>{children}</article>

        <nav className={styles.nav} aria-label="Links legais do PedeAqui">
          <Link href="/empresa">Informações legais</Link>
          <Link href="/politica-de-privacidade">Política de Privacidade</Link>
          <Link href="/termos-de-uso">Termos de Uso</Link>
          <Link href="/login">Entrar no PedeAqui</Link>
        </nav>
      </div>
    </main>
  );
}

export const legalPageStyles = styles;
