"use client";

import styles from "./dashboard.module.css";

export default function DashboardError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className={styles.errorPage}>
    <article className={styles.errorCard} role="alert">
      <h1>Não foi possível carregar o dashboard</h1>
      <p>Os indicadores não foram estimados. Tente carregar novamente para buscar os dados reais da unidade.</p>
      <button type="button" className={styles.retry} onClick={reset}>Tentar novamente</button>
    </article>
  </section>;
}
