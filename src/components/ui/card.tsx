import type { HTMLAttributes, ReactNode } from "react";
import styles from "./card.module.css";

export type CardKind = "operational" | "informational" | "kpi" | "order" | "product" | "table" | "customer" | "alert";
export type CardDensity = "compact" | "standard" | "comfortable";
export type CardTone = "neutral" | "success" | "warning" | "danger" | "info";

export type CardProps = HTMLAttributes<HTMLElement> & {
  kind?: CardKind;
  density?: CardDensity;
  tone?: CardTone;
};

export function Card({
  kind = "informational",
  density = "standard",
  tone = "neutral",
  className,
  children,
  ...props
}: CardProps) {
  const classes = [styles.card, styles[kind], styles[density], styles[tone], className].filter(Boolean).join(" ");
  return (
    <section {...props} className={classes} data-card-kind={kind} data-card-density={density} data-card-tone={tone}>
      {children}
    </section>
  );
}

export function CardHeader({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <header className={styles.header}>
      <div className={styles.heading}>
        <h3 className={styles.title}>{title}</h3>
        {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
      </div>
      {action}
    </header>
  );
}

export function CardBody({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={[styles.body, className].filter(Boolean).join(" ")}>{children}</div>;
}

export function CardActions({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={[styles.actions, className].filter(Boolean).join(" ")}>{children}</div>;
}

export function KpiValue({ children, className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={[styles.kpiValue, className].filter(Boolean).join(" ")}>{children}</div>;
}
