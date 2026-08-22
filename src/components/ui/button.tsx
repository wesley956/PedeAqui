"use client";

import type { ButtonHTMLAttributes } from "react";
import { useFormStatus } from "react-dom";
import styles from "./button.module.css";

export type ButtonTone = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

type BaseButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  tone?: ButtonTone;
  size?: ButtonSize;
  loading?: boolean;
  loadingLabel?: string;
};

type IconButtonProps = BaseButtonProps & {
  iconOnly: true;
  "aria-label": string;
};

type RegularButtonProps = BaseButtonProps & {
  iconOnly?: false;
};

export type ButtonProps = IconButtonProps | RegularButtonProps;

export function Button({
  tone = "primary",
  size = "md",
  iconOnly = false,
  loading = false,
  loadingLabel,
  className,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const formStatus = useFormStatus();
  const formPending = props.type === "submit" && formStatus.pending;
  const isLoading = loading || formPending;
  const isDisabled = disabled || isLoading;
  const classes = [
    styles.button,
    styles[tone],
    styles[size],
    iconOnly ? styles.iconOnly : null,
    className,
  ].filter(Boolean).join(" ");
  const content = isLoading && !iconOnly ? (loadingLabel ?? "Processando…") : children;

  return (
    <button
      {...props}
      className={classes}
      disabled={isDisabled}
      aria-busy={isLoading || undefined}
      data-tone={tone}
      data-size={size}
      data-icon-only={iconOnly || undefined}
      data-loading={isLoading || undefined}
    >
      {isLoading ? <span className={styles.spinner} aria-hidden="true" /> : null}
      {content}
    </button>
  );
}
