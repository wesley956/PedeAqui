"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/form-controls";
import { Button } from "@/components/ui/button";
import { saveInfinitePayAction } from "@/features/payments/actions";

export function InfinitePayConnectionForm({ handle, configured }: { handle: string | null; configured: boolean }) {
  const [state, action, pending] = useActionState(saveInfinitePayAction, { error: null, saved: false });
  return <form action={action} aria-label="Conectar InfinitePay" style={{ display: "grid", gap: 14 }}>
    <Input id="infinitepay-handle" name="handle" label="InfiniteTag da loja" defaultValue={handle ?? ""} required maxLength={100} placeholder="Nome da conta, sem o $" />
    <Input id="infinitepay-api-key" name="apiKey" type="password" label="Chave de integração da InfinitePay" autoComplete="off" required={!configured} maxLength={500}
      placeholder={configured ? "Deixe em branco para manter a atual" : "Cole a chave que começa com inchk_"} />
    {state.error ? <p role="alert">{state.error}</p> : null}
    {state.saved ? <p role="status">Conexão salva. Ative a InfinitePay abaixo para receber por ela.</p> : null}
    <div><Button type="submit" disabled={pending}>{pending ? "Salvando…" : "Salvar conexão InfinitePay"}</Button></div>
  </form>;
}
