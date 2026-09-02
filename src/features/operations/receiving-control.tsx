"use client";

import { Button } from "@/components/ui/button";
import { pauseOrdersAction, resumeOrdersAction } from "@/features/menu/actions";

type ReceivingState = {
  accepting: boolean;
  reason: string | null;
  pausedAt: string | null;
  pausedBy: string | null;
  canManage: boolean;
};

function pausedLabel(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

export function ReceivingControl({ state }: { state: ReceivingState }) {
  if (!state.canManage) return <span className="app-receiving-state" data-accepting={state.accepting}>{state.accepting ? "Recebendo pedidos" : "Pedidos pausados"}</span>;
  if (!state.accepting) return <form action={resumeOrdersAction} className="app-receiving-resume">
    <span title={[state.reason, state.pausedBy, pausedLabel(state.pausedAt)].filter(Boolean).join(" · ")}>Pedidos pausados</span>
    <Button size="sm" type="submit" loadingLabel="Retomando…">Retomar</Button>
  </form>;
  return <details className="app-receiving-control">
    <summary>Recebendo pedidos</summary>
    <form action={pauseOrdersAction}>
      <strong>Pausar novos pedidos</strong>
      <p>Pedidos já recebidos continuam normalmente. Seus horários não serão alterados.</p>
      <label htmlFor="global-pause-reason">Motivo</label>
      <select id="global-pause-reason" name="reason" defaultValue="Pausa operacional">
        <option>Pausa operacional</option>
        <option>Alta demanda</option>
        <option>Falta de entregador</option>
        <option>Problema técnico</option>
        <option>Encerramento do dia</option>
      </select>
      <Button size="sm" type="submit" loadingLabel="Pausando…">Confirmar pausa</Button>
    </form>
  </details>;
}
