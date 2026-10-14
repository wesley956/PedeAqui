"use client";

import { useState, type ReactNode } from "react";
import { NavigationIcon } from "@/components/ui/navigation-icon";
import styles from "@/app/(app)/cardapio/catalog-management.module.css";

/**
 * Peças comuns das subpáginas do Cardápio (Categorias, Adicionais, Sugestões e Promoções),
 * no mesmo padrão da lista de Produtos: cabeçalho com a ação principal à direita,
 * lista em linhas, interruptor de disponibilidade, "Editar" e menu "Ações".
 */

type CreateAction = { id: string; label: string; secondary?: boolean; content: ReactNode };

export function CatalogSectionHeader({ title, description, actions = [] }: { title: string; description: string; actions?: CreateAction[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <header className={styles.header}>
        <div className={styles.headerCopy}>
          <h2>{title}</h2>
          <p className="muted">{description}</p>
        </div>
        {actions.length > 0 ? (
          <div className={styles.headerActions}>
            {actions.map((action) => (
              <button
                key={action.id}
                type="button"
                className={action.secondary ? styles.secondaryAction : styles.primaryAction}
                aria-expanded={open === action.id}
                aria-controls={`painel-${action.id}`}
                onClick={() => setOpen((value) => (value === action.id ? null : action.id))}
              >
                {open === action.id ? "Fechar" : action.label}
              </button>
            ))}
          </div>
        ) : null}
      </header>
      {/* Os formulários ficam sempre na página (fechados ficam ocultos) para não perder o que já foi digitado ao fechar. */}
      {actions.map((action) => (
        <section key={action.id} id={`painel-${action.id}`} className={`card ${styles.createPanel}`} aria-label={action.label} hidden={open !== action.id}>
          <h3>{action.label}</h3>
          {action.content}
        </section>
      ))}
    </>
  );
}

export function CatalogRow({ main, aside, toggle, editor, editLabel, menu, menuLabel, compact = false }: {
  main: ReactNode;
  aside?: ReactNode;
  toggle?: ReactNode;
  editor?: ReactNode;
  editLabel?: string;
  menu?: ReactNode;
  menuLabel?: string;
  compact?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <article className={`${styles.row} ${compact ? styles.rowCompact : ""}`} role="listitem">
      <div className={styles.rowMain}>{main}</div>
      {aside ? <div className={styles.rowAside}>{aside}</div> : null}
      <div className={styles.rowActions}>
        {toggle}
        {editor ? (
          <button type="button" className={styles.rowButton} aria-expanded={editing} aria-label={editLabel} onClick={() => setEditing((value) => !value)}>
            {editing ? "Fechar" : "Editar"}
          </button>
        ) : null}
        {menu ? (
          <details className={styles.productMenu}>
            <summary aria-label={menuLabel}><NavigationIcon name="more" />Ações</summary>
            <div className={`${styles.productMenuBody} ${styles.rowMenuBody}`}>{menu}</div>
          </details>
        ) : null}
      </div>
      {editor ? <div className={styles.rowEditor} hidden={!editing}>{editor}</div> : null}
    </article>
  );
}
