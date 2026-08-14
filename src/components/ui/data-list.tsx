import type { ReactNode } from "react";
import { EmptyState, ErrorState, LoadingState } from "./feedback";
import styles from "./data-list.module.css";

export type DataColumn<T> = {
  key: string;
  header: string;
  render: (item: T) => ReactNode;
  numeric?: boolean;
  sort?: "ascending" | "descending" | "none";
};

export type ResponsiveDataListProps<T> = {
  items: T[];
  columns: DataColumn<T>[];
  getKey: (item: T) => string;
  caption: string;
  renderActions?: (item: T) => ReactNode;
  actionsLabel?: string;
  loading?: boolean;
  error?: string | null;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
};

export function ListToolbar({ primary, filters, sort, actions }: { primary?: ReactNode; filters?: ReactNode; sort?: ReactNode; actions?: ReactNode }) {
  return (
    <div className={styles.toolbar} role="search" aria-label="Ferramentas da listagem">
      <div className={styles.toolbarPrimary}>{primary}</div>
      <div className={styles.toolbarControls}>{filters}{sort}{actions}</div>
    </div>
  );
}

export function ResponsiveDataList<T>({
  items,
  columns,
  getKey,
  caption,
  renderActions,
  actionsLabel = "Ações",
  loading = false,
  error,
  emptyTitle = "Nenhum item encontrado",
  emptyDescription = "Ajuste a busca ou os filtros para tentar novamente.",
  emptyAction,
}: ResponsiveDataListProps<T>) {
  if (loading) return <LoadingState label={`Carregando ${caption.toLowerCase()}…`} />;
  if (error) return <ErrorState description={error} />;
  if (items.length === 0) return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;

  return (
    <div className={styles.root}>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <caption style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>{caption}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} scope="col" className={column.numeric ? styles.numeric : undefined} aria-sort={column.sort}>
                  {column.header}
                </th>
              ))}
              {renderActions ? <th scope="col" className={styles.actions}>{actionsLabel}</th> : null}
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={getKey(item)}>
                {columns.map((column) => <td key={column.key} className={column.numeric ? styles.numeric : undefined}>{column.render(item)}</td>)}
                {renderActions ? <td className={styles.actions}>{renderActions(item)}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.mobile} role="list" aria-label={caption}>
        {items.map((item) => (
          <article className={styles.mobileItem} role="listitem" key={getKey(item)}>
            {columns.map((column) => (
              <div className={styles.mobileField} key={column.key}>
                <span className={styles.mobileLabel}>{column.header}</span>
                <span className={[styles.mobileValue, column.numeric ? styles.numeric : null].filter(Boolean).join(" ")}>{column.render(item)}</span>
              </div>
            ))}
            {renderActions ? <div className={styles.mobileActions} aria-label={actionsLabel}>{renderActions(item)}</div> : null}
          </article>
        ))}
      </div>
    </div>
  );
}

export function ListPagination({ summary, previous, next }: { summary: ReactNode; previous?: ReactNode; next?: ReactNode }) {
  return (
    <nav className={styles.pagination} aria-label="Paginação da listagem">
      <span>{summary}</span>
      <div className={styles.paginationControls}>{previous}{next}</div>
    </nav>
  );
}
