"use client";

import { useActionState } from "react";
import { submitPixDocumentAction, type PixDocumentState } from "@/features/payments/public-pix-actions";

const initialState: PixDocumentState = { error: null };

export function PixDocumentForm({ slug, orderId }: { slug: string; orderId: string }) {
  const [state, action, pending] = useActionState(submitPixDocumentAction, initialState);
  return (
    <form action={action} style={{ width: "100%", display: "grid", gap: 8 }}>
      <input type="hidden" name="slug" value={slug} />
      <input type="hidden" name="orderId" value={orderId} />
      <label htmlFor="pix-cpf" style={{ fontWeight: "var(--font-weight-semibold)" }}>CPF de quem vai pagar</label>
      <input
        id="pix-cpf"
        name="cpf"
        inputMode="numeric"
        autoComplete="off"
        placeholder="000.000.000-00"
        maxLength={14}
        required
        aria-invalid={state.error ? true : undefined}
        aria-describedby="pix-cpf-help"
        style={{ minHeight: 44, fontSize: "var(--font-size-md)" }}
      />
      <p id="pix-cpf-help" className="muted" style={{ margin: 0, fontSize: "var(--font-size-xs)" }}>O banco do restaurante pede o CPF para gerar o Pix. Ele vai direto para o PagBank e não fica salvo aqui.</p>
      {state.error ? <p role="alert" style={{ margin: 0, color: "var(--danger)" }}>{state.error}</p> : null}
      <button type="submit" disabled={pending} style={{ minHeight: 44 }}>{pending ? "Gerando Pix…" : "Gerar Pix"}</button>
    </form>
  );
}
