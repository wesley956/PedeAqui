"use client";

import type { MouseEvent } from "react";
import { Button } from "@/components/ui/button";

export function ConfirmTeamActionButton({
  children,
  confirmation,
  tone = "secondary",
}: {
  children: string;
  confirmation: string;
  tone?: "secondary" | "danger";
}) {
  function confirmAction(event: MouseEvent<HTMLButtonElement>) {
    if (!window.confirm(confirmation)) event.preventDefault();
  }

  return <Button type="submit" tone={tone} size="sm" onClick={confirmAction}>{children}</Button>;
}
