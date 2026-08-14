import type { ReactNode } from "react";

export { SelectField as Select } from "./form-controls";
export { Card } from "./card";
export { EmptyState, Skeleton } from "./feedback";

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "success" | "danger" }) {
  const color = tone === "success" ? "var(--success)" : tone === "danger" ? "var(--danger)" : "var(--muted)";
  return <span style={{ display: "inline-flex", alignItems: "center", border: "var(--border-width) solid var(--border)", borderRadius: "var(--radius-pill)", padding: "var(--space-1) var(--space-2)", fontSize: "var(--font-size-xs)", lineHeight: "var(--line-height-snug)", color }}>{children}</span>;
}
