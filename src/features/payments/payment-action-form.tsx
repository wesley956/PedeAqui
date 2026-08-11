"use client";

import { useActionState } from "react";
import { paymentAction, type PaymentActionState } from "@/features/payments/actions";

const initialState: PaymentActionState = { ok: false, message: null, error: null };

export function PaymentActionForm({
  orderId,
  paymentId,
  method,
  intent,
  defaultCashReceived,
}: {
  orderId: string;
  paymentId: string;
  method: string;
  intent: "confirm" | "fail";
  defaultCashReceived?: string | null;
}) {
  const [state, action, pending] = useActionState(paymentAction, initialState);

  return (
    <form action={action} style={{ display: "grid", gap: 8, paddingTop: 8 }}>
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="paymentId" value={paymentId} />
      <input type="hidden" name="intent" value={intent} />

      {intent === "confirm" && method === "cash" ? (
        <label style={{ display: "grid", gap: 4 }}>
          <span className="muted" style={{ fontSize: 11 }}>VALOR RECEBIDO</span>
          <input name="cashReceived" inputMode="decimal" defaultValue={defaultCashReceived ?? ""} placeholder="Ex.: 50,00" style={inputStyle} />
        </label>
      ) : null}

      {intent === "confirm" && method !== "cash" ? (
        <label style={{ display: "grid", gap: 4 }}>
          <span className="muted" style={{ fontSize: 11 }}>REFERÊNCIA OPCIONAL</span>
          <input name="reference" maxLength={200} placeholder={method === "pix" ? "Ex.: comprovante/NSU informado" : "Ex.: comprovante da maquininha"} style={inputStyle} />
        </label>
      ) : null}

      {intent === "fail" ? (
        <label style={{ display: "grid", gap: 4 }}>
          <span className="muted" style={{ fontSize: 11 }}>MOTIVO</span>
          <input name="reason" required minLength={3} maxLength={240} placeholder="Ex.: Pix não localizado" style={inputStyle} />
        </label>
      ) : null}

      <button type="submit" disabled={pending} style={intent === "fail" ? dangerButton : primaryButton}>
        {pending ? "Processando…" : intent === "confirm" ? "Confirmar pagamento" : "Marcar tentativa como falha"}
      </button>
      {state.message ? <div style={{ color: "#22c55e", fontSize: 12 }}>{state.message}</div> : null}
      {state.error ? <div style={{ color: "#f97066", fontSize: 12 }}>{state.error}</div> : null}
    </form>
  );
}

const inputStyle: React.CSSProperties = {
  minHeight: 40,
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  color: "var(--text)",
  padding: "8px 10px",
};
const primaryButton: React.CSSProperties = {
  minHeight: 40,
  border: 0,
  borderRadius: 10,
  background: "var(--accent)",
  color: "#fff",
  padding: "8px 12px",
  fontWeight: 850,
  cursor: "pointer",
};
const dangerButton: React.CSSProperties = {
  ...primaryButton,
  background: "#b42318",
};
