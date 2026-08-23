"use client";

import { useActionState } from "react";
import {
  startDriverRouteTrackingAction,
  type RouteTrackingStartState,
} from "@/features/delivery/route-tracking-actions";
import styles from "@/features/delivery/delivery.module.css";

const initial: RouteTrackingStartState = { ok: false, message: null, error: null };

export function DriverRouteStartForm({ deliveryId }: { deliveryId: string }) {
  const [state, action, pending] = useActionState(startDriverRouteTrackingAction, initial);

  return <form action={action} className={styles.form}>
    <input type="hidden" name="deliveryId" value={deliveryId} />
    <button type="submit" disabled={pending} className={`${styles.button} ${styles.prominentButton}`}>
      {pending ? "Ativando rastreamento…" : "Ativar rastreamento da rota"}
    </button>
    {state.error ? <div className={styles.feedback} data-tone="danger">{state.error}</div> : null}
    {state.message ? <div className={styles.feedback} data-tone="success">{state.message}</div> : null}
  </form>;
}
