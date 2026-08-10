import type { InputHTMLAttributes } from "react";

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
};

export function Input({ label, hint, id, style, ...props }: InputProps) {
  const inputId = id ?? props.name;

  return (
    <label htmlFor={inputId} style={{ display: "grid", gap: 6 }}>
      <span style={{ fontWeight: 700, fontSize: 14 }}>{label}</span>
      <input
        {...props}
        id={inputId}
        style={{
          width: "100%",
          minHeight: 44,
          borderRadius: 10,
          border: "1px solid var(--border)",
          background: "var(--surface-2)",
          color: "var(--text)",
          padding: "10px 12px",
          ...style,
        }}
      />
      {hint ? <small className="muted">{hint}</small> : null}
    </label>
  );
}
