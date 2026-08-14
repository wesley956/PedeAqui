import type { InputHTMLAttributes } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
};

export function Input({ label, hint, id, style, ...props }: InputProps) {
  const inputId = id ?? props.name;

  return (
    <label htmlFor={inputId} style={{ display: "grid", gap: "var(--space-2)" }}>
      <span style={{ fontWeight: "var(--font-weight-bold)", fontSize: "var(--font-size-sm)", lineHeight: "var(--line-height-snug)" }}>{label}</span>
      <input
        {...props}
        id={inputId}
        style={{
          width: "100%",
          minHeight: "var(--control-height)",
          borderRadius: "var(--radius-md)",
          border: "var(--border-width) solid var(--border)",
          background: "var(--surface-2)",
          color: "var(--text)",
          padding: "var(--space-2) var(--space-3)",
          lineHeight: "var(--line-height-normal)",
          transition: "border-color var(--motion-fast) var(--ease-standard), background var(--motion-fast) var(--ease-standard)",
          ...style,
        }}
      />
      {hint ? <small className="muted" style={{ fontSize: "var(--font-size-xs)", lineHeight: "var(--line-height-normal)" }}>{hint}</small> : null}
    </label>
  );
}
