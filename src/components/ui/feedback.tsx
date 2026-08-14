"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "./button";
import styles from "./feedback.module.css";

export type FeedbackTone = "neutral" | "info" | "success" | "warning" | "danger";

const icons: Record<FeedbackTone, string> = {
  neutral: "•",
  info: "i",
  success: "✓",
  warning: "!",
  danger: "×",
};

export function Alert({ tone = "info", title, children, action }: { tone?: FeedbackTone; title?: ReactNode; children: ReactNode; action?: ReactNode }) {
  const urgent = tone === "danger" || tone === "warning";
  return (
    <div className={[styles.message, styles[tone]].join(" ")} role={urgent ? "alert" : "status"} aria-live={urgent ? "assertive" : "polite"}>
      <span className={styles.icon} aria-hidden="true">{icons[tone]}</span>
      <div className={styles.content}>
        {title ? <strong className={styles.title}>{title}</strong> : null}
        <div className={styles.description}>{children}</div>
      </div>
      {action ? <div className={styles.actions}>{action}</div> : null}
    </div>
  );
}

export function Toast({ tone = "info", title, children, action, onDismiss, dismissLabel = "Fechar aviso" }: { tone?: FeedbackTone; title?: ReactNode; children: ReactNode; action?: ReactNode; onDismiss?: () => void; dismissLabel?: string }) {
  return (
    <div className={styles.toast}>
      <div className={[styles.message, styles[tone]].join(" ")} role={tone === "danger" ? "alert" : "status"} aria-live={tone === "danger" ? "assertive" : "polite"}>
        <span className={styles.icon} aria-hidden="true">{icons[tone]}</span>
        <div className={styles.content}>
          {title ? <strong className={styles.title}>{title}</strong> : null}
          <div className={styles.description}>{children}</div>
        </div>
        <div className={styles.actions}>
          {action}
          {onDismiss ? <button type="button" className={styles.close} onClick={onDismiss} aria-label={dismissLabel}>×</button> : null}
        </div>
      </div>
    </div>
  );
}

export function Dialog({ open, title, description, children, primaryAction, secondaryAction, onClose, closeLabel = "Fechar diálogo" }: { open: boolean; title: string; description?: string; children?: ReactNode; primaryAction?: ReactNode; secondaryAction?: ReactNode; onClose: () => void; closeLabel?: string }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const handleClose = () => onClose();
    const handleCancel = (event: Event) => { event.preventDefault(); onClose(); };
    dialog.addEventListener("close", handleClose);
    dialog.addEventListener("cancel", handleCancel);
    return () => {
      dialog.removeEventListener("close", handleClose);
      dialog.removeEventListener("cancel", handleCancel);
    };
  }, [onClose]);

  return (
    <dialog ref={ref} className={styles.dialog} aria-labelledby="pedeaqui-dialog-title" aria-describedby={description ? "pedeaqui-dialog-description" : undefined}>
      <div className={styles.dialogInner}>
        <header className={styles.dialogHeader}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--space-3)" }}>
            <h2 id="pedeaqui-dialog-title" className={styles.dialogTitle}>{title}</h2>
            <button type="button" className={styles.close} onClick={onClose} aria-label={closeLabel}>×</button>
          </div>
          {description ? <p id="pedeaqui-dialog-description" className={styles.dialogDescription}>{description}</p> : null}
        </header>
        {children}
        {(secondaryAction || primaryAction) ? <footer className={styles.dialogActions}>{secondaryAction}{primaryAction}</footer> : null}
      </div>
    </dialog>
  );
}

export function ConfirmDialog({ open, title, description, confirmLabel = "Confirmar", cancelLabel = "Cancelar", destructive = false, loading = false, onConfirm, onClose }: { open: boolean; title: string; description?: string; confirmLabel?: string; cancelLabel?: string; destructive?: boolean; loading?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      title={title}
      description={description}
      onClose={onClose}
      secondaryAction={<Button tone="secondary" type="button" onClick={onClose}>{cancelLabel}</Button>}
      primaryAction={<Button tone={destructive ? "danger" : "primary"} type="button" loading={loading} onClick={onConfirm}>{confirmLabel}</Button>}
    />
  );
}

function StateBlock({ icon, title, description, action, role = "status" }: { icon: string; title: string; description?: string; action?: ReactNode; role?: "status" | "alert" }) {
  return (
    <div className={styles.state} role={role}>
      <span className={styles.icon} aria-hidden="true">{icon}</span>
      <strong className={styles.stateTitle}>{title}</strong>
      {description ? <span className={styles.stateDescription}>{description}</span> : null}
      {action}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <StateBlock icon="○" title={title} description={description} action={action} />;
}

export function LoadingState({ label = "Carregando…" }: { label?: string }) {
  return <div className={styles.state} role="status" aria-live="polite"><span className={styles.spinner} aria-hidden="true" /><span className={styles.stateDescription}>{label}</span></div>;
}

export function ErrorState({ title = "Não foi possível carregar", description, action }: { title?: string; description?: string; action?: ReactNode }) {
  return <StateBlock icon="×" title={title} description={description} action={action} role="alert" />;
}

export function SuccessState({ title = "Concluído", description, action }: { title?: string; description?: string; action?: ReactNode }) {
  return <StateBlock icon="✓" title={title} description={description} action={action} />;
}

export function Skeleton({ width = "100%", height = 20, label = "Carregando conteúdo" }: { width?: string | number; height?: string | number; label?: string }) {
  return <span className={styles.skeleton} style={{ width, height }} role="status" aria-label={label} />;
}
