"use client";

import Link from "next/link";
import { useActionState } from "react";
import { orderManagerAction, type OrderManagerActionState } from "@/features/orders/actions";

const initialOrderManagerActionState: OrderManagerActionState = { ok: false, message: null, error: null };

export type ManagerIntent =
  | "accept"
  | "accept_and_start"
  | "reject"
  | "cancel"
  | "start_production"
  | "mark_ready"
  | "mark_paid"
  | "mark_paid_and_complete"
  | "await_pickup"
  | "customer_picked_up"
  | "await_courier"
  | "courier_assigned"
  | "courier_picked_up"
  | "out_for_delivery"
  | "delivered"
  | "manual_out_for_delivery"
  | "manual_finish_delivery"
  | "served"
  | "complete"
  | "print"
  | "reprint";

const routedDeliveryIntents = new Set<ManagerIntent>(["courier_assigned", "courier_picked_up", "out_for_delivery", "delivered"]);

export function OrderActionForm({ orderId, intent, label, tone = "primary", reasonLabel, reasonPlaceholder, printJobId, compact = false, confirmPayment = false }: {
  orderId: string;
  intent: ManagerIntent;
  label: string;
  tone?: "primary" | "secondary" | "danger";
  reasonLabel?: string;
  reasonPlaceholder?: string;
  printJobId?: string;
  compact?: boolean;
  confirmPayment?: boolean;
}) {
  const [state, action, pending] = useActionState(orderManagerAction, initialOrderManagerActionState);
  const iconOnlyPrint = intent === "print" && compact && !reasonLabel;
  if (routedDeliveryIntents.has(intent)) {
    return <Link href="/entregas" style={{ ...buttonStyle("secondary"), display: "grid", placeItems: "center", textDecoration: "none" }}>{label} → Entregas</Link>;
  }
  return (
    <form action={action} onSubmit={confirmPayment ? (event) => { if (!window.confirm("Você recebeu o pagamento deste pedido? Ao confirmar, o PedeAqui dará a baixa financeira.")) event.preventDefault(); } : undefined} style={{ display: "grid", gap: 6 }}>
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="intent" value={intent} />
      {confirmPayment ? <input type="hidden" name="paymentReceived" value="yes" /> : null}
      {printJobId ? <input type="hidden" name="printJobId" value={printJobId} /> : null}
      {reasonLabel ? <label style={{ display: "grid", gap: 4 }}><span style={{ fontSize: 11, fontWeight: 800 }}>{reasonLabel}</span><input name="reason" required minLength={3} maxLength={500} placeholder={reasonPlaceholder} style={inputStyle} /></label> : null}
      <button
        type="submit"
        disabled={pending}
        aria-label={iconOnlyPrint ? label : undefined}
        title={iconOnlyPrint ? label : undefined}
        style={{ ...buttonStyle(tone), ...(compact ? compactStyle : null), ...(iconOnlyPrint ? iconOnlyPrintStyle : null), opacity: pending ? 0.65 : 1 }}
      >
        {iconOnlyPrint ? <PrinterIcon pending={pending} /> : pending ? "Processando…" : label}
      </button>
      {state.error ? <span role="alert" style={{ color: "#f97066", fontSize: 11 }}>{state.error}</span> : null}
      {state.ok && state.message ? <span role="status" style={{ color: "#75c88a", fontSize: 11 }}>{state.message}</span> : null}
    </form>
  );
}

function PrinterIcon({ pending }: { pending: boolean }) {
  if (pending) return <span aria-hidden="true" style={{ fontSize: 12, lineHeight: 1 }}>…</span>;
  return (
    <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9V3h12v6" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
      <path d="M6 14h12v7H6z" />
    </svg>
  );
}

const inputStyle: React.CSSProperties = { minHeight: 38, borderRadius: 9, border: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text)", padding: "7px 9px" };
function buttonStyle(tone: "primary" | "secondary" | "danger"): React.CSSProperties { return { minHeight: 38, borderRadius: 9, border: tone === "secondary" ? "1px solid var(--border)" : 0, background: tone === "danger" ? "#b42318" : tone === "secondary" ? "var(--surface-3)" : "var(--accent)", color: "var(--text)", padding: "7px 11px", fontWeight: 850, cursor: "pointer" }; }
const compactStyle: React.CSSProperties = { minHeight: 32, padding: "5px 8px", fontSize: 12 };
const iconOnlyPrintStyle: React.CSSProperties = { width: 30, height: 30, minHeight: 30, padding: 0, borderRadius: 7, background: "transparent", color: "var(--text-secondary)", justifySelf: "start", display: "inline-grid", placeItems: "center" };
