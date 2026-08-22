"use client";

import type { MouseEvent, ReactNode } from "react";
import { Button, type ButtonTone } from "@/components/ui/button";

export function ConfirmSubmitButton({
  children,
  confirmation,
  tone = "danger",
  size = "sm",
}: {
  children: ReactNode;
  confirmation: string;
  tone?: ButtonTone;
  size?: "sm" | "md";
}) {
  function confirmSubmit(event: MouseEvent<HTMLButtonElement>) {
    if (!window.confirm(confirmation)) event.preventDefault();
  }

  return <Button type="submit" tone={tone} size={size} onClick={confirmSubmit}>{children}</Button>;
}
