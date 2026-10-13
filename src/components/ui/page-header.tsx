import type { ReactNode } from "react";
import styles from "./page-header.module.css";

/**
 * Cabeçalho padrão das telas do painel (guia visual):
 * título de 24 px à esquerda, descrição opcional de uma linha e
 * no máximo uma ação principal e uma secundária à direita.
 * Sem selo acima do título: a localização já aparece no menu.
 */
export function PageHeader({
  title,
  description,
  status,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  /** Etiquetas pequenas ao lado do título, como "Ao vivo". */
  status?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className={styles.header}>
      <div className={styles.copy}>
        <div className={styles.titleRow}>
          <h1 className={styles.title}>{title}</h1>
          {status ? <div className={styles.status}>{status}</div> : null}
        </div>
        {description ? <p className={styles.description}>{description}</p> : null}
      </div>
      {actions ? <div className={styles.actions}>{actions}</div> : null}
    </header>
  );
}
