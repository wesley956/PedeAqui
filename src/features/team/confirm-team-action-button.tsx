"use client";

import { ConfirmSubmitButton } from "@/components/ui/confirm-submit-button";

export function ConfirmTeamActionButton({
  children,
  confirmation,
}: {
  children: string;
  confirmation: string;
  /** Mantido por compatibilidade: o vermelho fica só na confirmação. */
  tone?: "secondary" | "danger";
}) {
  return <ConfirmSubmitButton confirmation={confirmation}>{children}</ConfirmSubmitButton>;
}
