import type { ButtonHTMLAttributes } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: "primary" | "secondary" | "danger";
};

export function Button({ tone = "primary", style, ...props }: ButtonProps) {
  const backgrounds = {
    primary: "linear-gradient(135deg, var(--accent), var(--accent-strong))",
    secondary: "var(--surface-2)",
    danger: "var(--danger)",
  } as const;

  return (
    <button
      {...props}
      style={{
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "10px 14px",
        minHeight: 42,
        background: backgrounds[tone],
        color: "var(--text)",
        cursor: props.disabled ? "not-allowed" : "pointer",
        opacity: props.disabled ? 0.6 : 1,
        fontWeight: 700,
        ...style,
      }}
    />
  );
}
