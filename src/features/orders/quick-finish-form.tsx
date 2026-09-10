"use client";

import { useActionState } from "react";
import { quickFinishOrderAction, type QuickFinishState } from "@/features/orders/quick-finish-action";

const initialState: QuickFinishState = { ok: false, message: null, error: null };

export function QuickFinishOrderForm({ orderId, paymentPending = false }: { orderId: string; paymentPending?: boolean }) {
  const [state, action, pending] = useActionState(quickFinishOrderAction, initialState);
  return (
    <form action={action} style={{ display: "grid", gap: 6 }}>
      <input type="hidden" name="orderId" value={orderId} />
      <button
        type="submit"
        disabled={pending}
        style={{
          minHeight: 36,
          borderRadius: 9,
          border: 0,
          background: "var(--accent)",
          color: "var(--text)",
          padding: "7px 11px",
          fontWeight: 850,
          cursor: pending ? "wait" : "pointer",
          opacity: pending ? 0.65 : 1,
        }}
      >
        {pending ? "Finalizando…" : paymentPending ? "Receber e finalizar" : "Finalizar pedido"}
      </button>
      {state.error ? <span role="alert" style={{ color: "#f97066", fontSize: 11 }}>{state.error}</span> : null}
      {state.ok && state.message ? <span role="status" style={{ color: "#75c88a", fontSize: 11 }}>{state.message}</span> : null}
    </form>
  );
}
