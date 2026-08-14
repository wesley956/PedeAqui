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
        border: "var(--border-width) solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: "var(--space-2) var(--control-padding-x)",
        minHeight: "var(--control-height)",
        background: backgrounds[tone],
        color: "var(--text)",
        cursor: props.disabled ? "not-allowed" : "pointer",
        opacity: props.disabled ? 0.6 : 1,
        fontWeight: "var(--font-weight-bold)",
        lineHeight: "var(--line-height-snug)",
        transition: "background var(--motion-fast) var(--ease-standard), border-color var(--motion-fast) var(--ease-standard), opacity var(--motion-fast) var(--ease-standard)",
        ...style,
      }}
    />
  );
}
