import styles from "./loading.module.css";

export default function PanelLoading() {
  return (
    <section className={styles.root} aria-live="polite" aria-label="Carregando página">
      <div className={styles.heading} />
      <div className={styles.subheading} />
      <div className={styles.grid}>
        <div className={styles.card} />
        <div className={styles.card} />
        <div className={styles.card} />
      </div>
      <div className={styles.panel} />
      <span className={styles.srOnly}>Carregando…</span>
    </section>
  );
}
