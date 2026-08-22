"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

export function PendingSubmitButton({
  children,
  pendingLabel = "Processando…",
  className,
}: {
  children: ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return <button type="submit" className={className} disabled={pending} aria-disabled={pending} aria-busy={pending}>
    {pending ? pendingLabel : children}
  </button>;
}
