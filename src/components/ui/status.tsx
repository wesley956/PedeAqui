import type { HTMLAttributes } from "react";
import styles from "./status.module.css";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

export const operationalStatusMap = {
  order_new: { label: "Novo", icon: "●", tone: "info" },
  order_confirmed: { label: "Confirmado", icon: "✓", tone: "info" },
  order_preparing: { label: "Em preparo", icon: "…", tone: "warning" },
  order_ready: { label: "Pronto", icon: "✓", tone: "success" },
  order_out_for_delivery: { label: "Saiu para entrega", icon: "→", tone: "info" },
  order_completed: { label: "Concluído", icon: "✓", tone: "success" },
  order_cancelled: { label: "Cancelado", icon: "×", tone: "danger" },
  order_late: { label: "Atrasado", icon: "!", tone: "danger" },

  payment_pending: { label: "Pagamento pendente", icon: "○", tone: "warning" },
  payment_paid: { label: "Pago", icon: "✓", tone: "success" },
  payment_failed: { label: "Pagamento falhou", icon: "×", tone: "danger" },
  payment_refunded: { label: "Estornado", icon: "↶", tone: "neutral" },
  payment_partial_refund: { label: "Estorno parcial", icon: "↶", tone: "warning" },

  delivery_waiting: { label: "Aguardando entrega", icon: "○", tone: "neutral" },
  delivery_assigned: { label: "Entregador atribuído", icon: "✓", tone: "info" },
  delivery_picked_up: { label: "Retirado", icon: "↑", tone: "info" },
  delivery_in_route: { label: "Em rota", icon: "→", tone: "info" },
  delivery_delivered: { label: "Entregue", icon: "✓", tone: "success" },
  delivery_late: { label: "Entrega atrasada", icon: "!", tone: "danger" },
  delivery_cancelled: { label: "Entrega cancelada", icon: "×", tone: "danger" },

  cash_open: { label: "Caixa aberto", icon: "●", tone: "success" },
  cash_closed: { label: "Caixa fechado", icon: "○", tone: "neutral" },
  cash_attention: { label: "Caixa requer atenção", icon: "!", tone: "warning" },

  inventory_ok: { label: "Estoque normal", icon: "✓", tone: "success" },
  inventory_low: { label: "Estoque baixo", icon: "!", tone: "warning" },
  inventory_critical: { label: "Estoque crítico", icon: "!", tone: "danger" },
  inventory_out: { label: "Sem estoque", icon: "×", tone: "danger" },

  generic_pending: { label: "Pendente", icon: "○", tone: "neutral" },
  generic_active: { label: "Ativo", icon: "●", tone: "success" },
  generic_in_progress: { label: "Em andamento", icon: "→", tone: "info" },
  generic_attention: { label: "Atenção", icon: "!", tone: "warning" },
  generic_success: { label: "Concluído", icon: "✓", tone: "success" },
  generic_error: { label: "Falhou", icon: "×", tone: "danger" },
} as const satisfies Record<string, { label: string; icon: string; tone: StatusTone }>;

export type OperationalStatusKey = keyof typeof operationalStatusMap;

export function StatusBadge({ status, label, className, ...props }: Omit<HTMLAttributes<HTMLSpanElement>, "children"> & { status: OperationalStatusKey; label?: string }) {
  const definition = operationalStatusMap[status];
  const visibleLabel = label ?? definition.label;
  return (
    <span
      {...props}
      className={[styles.status, styles[definition.tone], className].filter(Boolean).join(" ")}
      data-status={status}
      data-status-tone={definition.tone}
      aria-label={visibleLabel}
    >
      <span className={styles.icon} aria-hidden="true">{definition.icon}</span>
      <span>{visibleLabel}</span>
    </span>
  );
}

export function SemanticStatus({ tone, label, icon, className, ...props }: Omit<HTMLAttributes<HTMLSpanElement>, "children"> & { tone: StatusTone; label: string; icon: string }) {
  return (
    <span {...props} className={[styles.status, styles[tone], className].filter(Boolean).join(" ")} data-status-tone={tone} aria-label={label}>
      <span className={styles.icon} aria-hidden="true">{icon}</span>
      <span>{label}</span>
    </span>
  );
}
