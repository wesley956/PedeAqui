"use client";

import { useActionState } from "react";
import {
  orderManagerAction,
  type OrderManagerActionState,
} from "@/features/orders/actions";

const initialOrderManagerActionState: OrderManagerActionState = {
  ok: false,
  message: null,
  error: null,
};

export type ManagerIntent =
  | "accept"
  | "reject"
  | "start_production"
  | "mark_ready"
  | "mark_paid"
  | "await_pickup"
  | "customer_picked_up"
  | "await_courier"
  | "courier_assigned"
  | "courier_picked_up"
  | "out_for_delivery"
  | "delivered"
  | "complete"
  | "reprint";

export function OrderActionForm({
  orderId,
  intent,
  label,
  tone = "primary",
  reasonLabel,
  reasonPlaceholder,
  printJobId,
  compact = false,
}: {
  orderId: string;
  intent: ManagerIntent;
  label: string;
  tone?: "primary" | "secondary" | "danger";
  reasonLabel?: string;
  reasonPlaceholder?: string;
  printJobId?: string;
  compact?: boolean;
}) {
  const [state, action, pending] = useActionState(orderManagerAction, initialOrderManagerActionState);
  return (
    <form action={action} style={{ display: "grid", gap: 6 }}>
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="intent" value={intent} />
      {printJobId ? <input type="hidden" name="printJobId" value={printJobId} /> : null}
      {reasonLabel ? (
        <label style={{ display: "grid", gap: 4 }}>
          <span style={{ fontSize: 11, fontWeight: 800 }}>{reasonLabel}</span>
          <input
            name="reason"
            required
            minLength={3}
            maxLength={500}
            placeholder={reasonPlaceholder}
            style={inputStyle}
          />
        </label>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        style={{ ...buttonStyle(tone), ...(compact ? compactStyle : null), opacity: pending ? 0.65 : 1 }}
      >
        {pending ? "Processando…" : label}
      </button>
      {state.error ? <span role="alert" style={{ color: "#f97066", fontSize: 11 }}>{state.error}</span> : null}
      {state.ok && state.message ? <span role="status" style={{ color: "#75c88a", fontSize: 11 }}>{state.message}</span> : null}
    </form>
  );
}

const inputStyle: React.CSSProperties = {
  minHeight: 38,
  borderRadius: 9,
  border: "1px solid var(--border)",
  background: "var(--surface-2)",
  color: "var(--text)",
  padding: "7px 9px",
};

function buttonStyle(tone: "primary" | "secondary" | "danger"): React.CSSProperties {
  return {
    minHeight: 38,
    borderRadius: 9,
    border: tone === "secondary" ? "1px solid var(--border)" : 0,
    background: tone === "danger" ? "#b42318" : tone === "secondary" ? "var(--surface-3)" : "var(--accent)",
    color: "var(--text)",
    padding: "7px 11px",
    fontWeight: 850,
    cursor: "pointer",
  };
}

const compactStyle: React.CSSProperties = { minHeight: 32, padding: "5px 8px", fontSize: 12 };
