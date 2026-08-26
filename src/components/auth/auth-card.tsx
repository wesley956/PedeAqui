import Link from "next/link";
import type { ReactNode } from "react";
import { PedeAquiLogo } from "@/components/brand/pedeaqui-brand";
import { PEDEAQUI_LEGAL } from "@/lib/legal/company";
import styles from "./auth-card.module.css";

export function AuthCard({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <main className={styles.root}>
      <section className={styles.card}>
        <div className={styles.heading}>
          <div className={styles.logo}>
            <PedeAquiLogo size="md" priority />
          </div>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.subtitle}>{subtitle}</p>
        </div>
        {children}
        <footer className={styles.legalFooter}>
          <p className={styles.legalIdentity}>
            Responsável empresarial: {PEDEAQUI_LEGAL.legalName} · CNPJ {PEDEAQUI_LEGAL.cnpj}
          </p>
          <nav className={styles.legalLinks} aria-label="Informações legais do PedeAqui">
            <Link href="/empresa">Informações legais</Link>
            <Link href="/politica-de-privacidade">Privacidade</Link>
            <Link href="/termos-de-uso">Termos de Uso</Link>
          </nav>
        </footer>
      </section>
    </main>
  );
}
