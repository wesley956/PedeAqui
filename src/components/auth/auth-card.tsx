import type { ReactNode } from "react";
import { PedeAquiLogo } from "@/components/brand/pedeaqui-brand";
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
      </section>
    </main>
  );
}
