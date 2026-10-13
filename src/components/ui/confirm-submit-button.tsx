"use client";

import { useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Button, type ButtonTone } from "@/components/ui/button";
import { Dialog } from "@/components/ui/feedback";

/**
 * Botão que só envia o formulário depois de uma confirmação no próprio tema
 * (sem o alerta nativo do navegador). O botão que abre a confirmação é neutro;
 * o vermelho fica apenas no botão que confirma a ação.
 */
export function ConfirmSubmitButton({
  children,
  confirmation,
  tone = "secondary",
  size = "sm",
  confirmLabel,
}: {
  children: ReactNode;
  confirmation: string;
  tone?: ButtonTone;
  size?: "sm" | "md";
  /** Texto do botão de confirmação; padrão: o mesmo texto do botão. */
  confirmLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const submitter = useRef<HTMLButtonElement | null>(null);
  const label = typeof children === "string" ? children : "Confirmar";

  function askFirst(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    submitter.current = event.currentTarget;
    setOpen(true);
  }

  function confirm() {
    setOpen(false);
    const button = submitter.current;
    button?.form?.requestSubmit(button);
  }

  return <>
    <Button type="submit" tone={tone} size={size} onClick={askFirst}>{children}</Button>
    <Dialog
      open={open}
      title={`${label}?`}
      description={confirmation}
      onClose={() => setOpen(false)}
      secondaryAction={<Button type="button" tone="secondary" onClick={() => setOpen(false)}>Voltar</Button>}
      primaryAction={<Button type="button" tone="danger" onClick={confirm}>{confirmLabel ?? label}</Button>}
    />
  </>;
}
