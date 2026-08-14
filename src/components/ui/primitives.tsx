import type { HTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export function Card({ children, style, ...props }: HTMLAttributes<HTMLElement>) {
  return <section {...props} className={`card ${props.className ?? ""}`} style={{ padding: "var(--space-5)", ...style }}>{children}</section>;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "danger" }) {
  const color = tone === "success" ? "var(--success)" : tone === "danger" ? "var(--danger)" : "var(--muted)";
  return <span style={{ display: "inline-flex", alignItems: "center", border: "var(--border-width) solid var(--border)", borderRadius: "var(--radius-pill)", padding: "var(--space-1) var(--space-2)", fontSize: "var(--font-size-xs)", lineHeight: "var(--line-height-snug)", color }}>{children}</span>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="card" style={{ padding: "var(--space-8)", textAlign: "center", display: "grid", gap: "var(--space-3)", justifyItems: "center" }}>
      <strong>{title}</strong>
      <span className="muted">{description}</span>
      {action}
    </div>
  );
}

export function Skeleton({ width = "100%", height = 20 }: { width?: string | number; height?: string | number }) {
  return <span aria-hidden style={{ display: "block", width, height, borderRadius: "var(--radius-sm)", background: "var(--surface-2)", opacity: .8 }} />;
}

export function Select({ label, children, id, style, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: ReactNode }) {
  const selectId = id ?? props.name;
  return (
    <label htmlFor={selectId} style={{ display: "grid", gap: "var(--space-2)" }}>
      <span style={{ fontWeight: "var(--font-weight-bold)", fontSize: "var(--font-size-sm)", lineHeight: "var(--line-height-snug)" }}>{label}</span>
      <select {...props} id={selectId} style={{ minHeight: "var(--control-height)", borderRadius: "var(--radius-md)", border: "var(--border-width) solid var(--border)", background: "var(--surface-2)", color: "var(--text)", padding: "var(--space-2) var(--space-3)", lineHeight: "var(--line-height-normal)", transition: "border-color var(--motion-fast) var(--ease-standard), background var(--motion-fast) var(--ease-standard)", ...style }}>
        {children}
      </select>
    </label>
  );
}
