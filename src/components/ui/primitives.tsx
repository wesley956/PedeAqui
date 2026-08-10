import type { HTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";

export function Card({ children, style, ...props }: HTMLAttributes<HTMLElement>) {
  return <section {...props} className={`card ${props.className ?? ""}`} style={{ padding: 18, ...style }}>{children}</section>;
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "danger" }) {
  const color = tone === "success" ? "var(--success)" : tone === "danger" ? "var(--danger)" : "var(--muted)";
  return <span style={{ display: "inline-flex", alignItems: "center", border: "1px solid var(--border)", borderRadius: 999, padding: "4px 8px", fontSize: 12, color }}>{children}</span>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return (
    <div className="card" style={{ padding: 28, textAlign: "center", display: "grid", gap: 10, justifyItems: "center" }}>
      <strong>{title}</strong>
      <span className="muted">{description}</span>
      {action}
    </div>
  );
}

export function Skeleton({ width = "100%", height = 20 }: { width?: string | number; height?: string | number }) {
  return <span aria-hidden style={{ display: "block", width, height, borderRadius: 8, background: "var(--surface-2)", opacity: .8 }} />;
}

export function Select({ label, children, id, style, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; children: ReactNode }) {
  const selectId = id ?? props.name;
  return (
    <label htmlFor={selectId} style={{ display: "grid", gap: 6 }}>
      <span style={{ fontWeight: 700, fontSize: 14 }}>{label}</span>
      <select {...props} id={selectId} style={{ minHeight: 44, borderRadius: 10, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", padding: "10px 12px", ...style }}>
        {children}
      </select>
    </label>
  );
}
