"use client";

import { useFormStatus } from "react-dom";

export function SubmitOrderButton({ className, label }: { className?: string; label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending} aria-disabled={pending}>
      {pending ? "Enviando pedido…" : label}
    </button>
  );
}
