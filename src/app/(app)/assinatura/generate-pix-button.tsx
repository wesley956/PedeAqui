"use client";

import { useActionState } from "react";
import {
  generateSubscriptionPixAction,
  type GenerateSubscriptionPixState,
} from "@/features/subscription/actions";
import styles from "./assinatura.module.css";

const initialState: GenerateSubscriptionPixState = { status: "idle", message: "" };

export function GeneratePixButton({ invoiceId, renew = false }: { invoiceId: string; renew?: boolean }) {
  const [state, action, pending] = useActionState(generateSubscriptionPixAction, initialState);

  return (
    <form action={action} className={styles.pixActions}>
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <button type="submit" disabled={pending}>
        {pending ? "Gerando PIX..." : renew ? "Gerar novo PIX" : "Gerar PIX da mensalidade"}
      </button>
      {state.message ? <span className={styles.muted} role={state.status === "error" ? "alert" : "status"}>{state.message}</span> : null}
    </form>
  );
}
