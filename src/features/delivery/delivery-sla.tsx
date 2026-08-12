"use client";

import { useEffect, useState } from "react";

export function DeliverySla({ promisedByAt, deliveredAt }: { promisedByAt: string | null; deliveredAt?: string | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!promisedByAt || deliveredAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [promisedByAt, deliveredAt]);
  if (!promisedByAt) return <span className="muted">Sem SLA calculado</span>;
  const deadline = Date.parse(promisedByAt);
  const reference = deliveredAt ? Date.parse(deliveredAt) : now;
  const minutes = Math.round((deadline - reference) / 60_000);
  if (deliveredAt) return <span style={{ color: reference <= deadline ? "#22c55e" : "#f97066" }}>{reference <= deadline ? "Entregue no prazo" : "Entregue com atraso"}</span>;
  if (minutes < 0) return <strong style={{ color: "#f97066" }}>Atrasado {Math.abs(minutes)} min</strong>;
  if (minutes <= 10) return <strong style={{ color: "#f59e0b" }}>SLA {minutes} min</strong>;
  return <span style={{ color: "#22c55e" }}>SLA {minutes} min</span>;
}
