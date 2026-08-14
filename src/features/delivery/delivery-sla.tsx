"use client";

import { useEffect, useState } from "react";
import styles from "@/features/delivery/delivery.module.css";

export function DeliverySla({ promisedByAt, deliveredAt }: { promisedByAt: string | null; deliveredAt?: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!promisedByAt || deliveredAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [promisedByAt, deliveredAt]);

  if (!promisedByAt) return <span className={styles.sla} data-tone="neutral">Sem prazo calculado</span>;
  const deadline = Date.parse(promisedByAt);
  const reference = deliveredAt ? Date.parse(deliveredAt) : now;
  const minutes = Math.round((deadline - reference) / 60_000);

  if (deliveredAt) return <span className={styles.sla} data-tone={reference <= deadline ? "success" : "danger"}>{reference <= deadline ? "Entregue no prazo" : "Entregue com atraso"}</span>;
  if (minutes < 0) return <strong className={styles.sla} data-tone="danger">Atrasada {Math.abs(minutes)} min</strong>;
  if (minutes <= 10) return <strong className={styles.sla} data-tone="warning">Prazo em {minutes} min</strong>;
  return <span className={styles.sla} data-tone="success">Prazo em {minutes} min</span>;
}
