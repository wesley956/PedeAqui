"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { realtimeStoreScope } from "@/lib/supabase/realtime";
import { recognizePrintedJobAction, retryPrintJobAction } from "@/features/printing/actions";
import type { HealthSeverity, OperationalHealthSnapshot } from "@/server/operations/operational-health-service";

const rank: Record<HealthSeverity, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

export function OperationalHealthIndicator({ storeId, snapshot }: { storeId: string | null; snapshot: OperationalHealthSnapshot }) {
  const [connection, setConnection] = useState<"connecting" | "connected" | "degraded">("connecting");
  useEffect(() => {
    const scope = storeId ? realtimeStoreScope(storeId) : null;
    if (!scope) return;
    const supabase = createClient();
    const channel = supabase.channel(`global-health:${scope.storeId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: scope.filter }, () => undefined)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") setConnection("connected");
        else if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) setConnection("degraded");
        else setConnection("connecting");
      });
    const offline = () => setConnection("degraded");
    const online = () => setConnection("connecting");
    window.addEventListener("offline", offline);
    window.addEventListener("online", online);
    return () => {
      window.removeEventListener("offline", offline);
      window.removeEventListener("online", online);
      void supabase.removeChannel(channel);
    };
  }, [storeId]);
  const issues = useMemo(() => [...snapshot.issues].sort((a, b) => rank[a.severity] - rank[b.severity]), [snapshot.issues]);
  const worst = connection === "degraded" ? "P0" : issues[0]?.severity ?? null;
  const label = worst === "P0" ? "Ação imediata" : worst === "P1" ? "Atenção operacional" : connection === "connecting" ? "Conferindo operação…" : "Operação saudável";
  return <details className="operational-health" data-severity={worst ?? "healthy"}>
    <summary aria-label={`Saúde operacional: ${label}`}>{label}{issues.length > 0 ? ` · ${issues.length}` : ""}</summary>
    <div className="operational-health-panel">
      <header><strong>Saúde da operação</strong><span>Atualizada automaticamente</span></header>
      <HealthItem severity={connection === "degraded" ? "P0" : connection === "connecting" ? "P2" : "P3"} title="Atualização ao vivo" cause={connection === "connected" ? "Conexão ativa." : connection === "connecting" ? "Reconexão em andamento." : "A conexão ao vivo foi interrompida."} impact={connection === "degraded" ? "Mudanças podem demorar; o painel confere os dados automaticamente." : "Pedidos continuam sendo acompanhados."} action={connection === "degraded" ? "Confira a internet; não é necessário apertar F5." : "Nenhuma ação necessária."} />
      {issues.map((issue) => <HealthItem key={issue.id} {...issue}>
        {issue.orderId ? <Link href={`/pedidos/${issue.orderId}`}>Abrir pedido</Link> : null}
        {issue.area === "printing" ? <Link href="/configuracoes/impressoes">Abrir impressões</Link> : <Link href="/configuracoes/pagamentos">Abrir pagamentos</Link>}
        {issue.jobId ? <form action={retryPrintJobAction}><input type="hidden" name="jobId" value={issue.jobId} /><button type="submit">Tentar novamente</button></form> : null}
        {issue.jobId ? <details className="operational-health-manual"><summary>Já imprimiu por outro meio?</summary><form action={recognizePrintedJobAction}><input type="hidden" name="jobId" value={issue.jobId} /><input name="reason" required minLength={5} maxLength={500} placeholder="Como confirmou a impressão?" /><label><input type="checkbox" name="confirmed" required /> Confirmo que o documento realmente foi impresso</label><button type="submit">Reconhecer manualmente</button></form></details> : null}
      </HealthItem>)}
      {issues.length === 0 && connection === "connected" ? <p className="operational-health-ok">Impressão configurada, pagamentos online e atualização ao vivo não apresentam bloqueios conhecidos.</p> : null}
    </div>
  </details>;
}

function HealthItem({ severity, title, cause, impact, action, children }: { severity: HealthSeverity; title: string; cause: string; impact: string; action: string; children?: ReactNode }) {
  return <article className="operational-health-item" data-severity={severity}><div><strong>{severity} · {title}</strong><p><b>Causa:</b> {cause}</p><p><b>Impacto:</b> {impact}</p><p><b>Próxima ação:</b> {action}</p></div>{children ? <div className="operational-health-actions">{children}</div> : null}</article>;
}
