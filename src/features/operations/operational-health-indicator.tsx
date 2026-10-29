"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { realtimeStoreScope } from "@/lib/supabase/realtime";
import { recognizePrintedJobAction, retryPrintJobAction } from "@/features/printing/actions";
import type { HealthSeverity, OperationalHealthIssue, OperationalHealthOrigin, OperationalHealthSnapshot } from "@/server/operations/operational-health-service";
import { PRINTING_SAFETY_POLL_MS, readPrintingSafety, type PrintingSafetyUpdate } from "@/features/printing/printing-safety-poll";
import { PrintingSafetySound } from "@/features/printing/printing-safety-sound";

const rank: Record<HealthSeverity, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };
const originLabel: Record<OperationalHealthOrigin, string> = {
  app: "Sistema",
  integration: "Integração",
  local_equipment: "Equipamento local",
};

function recoveryLink(issue: OperationalHealthIssue) {
  if (issue.area === "printing") return { href: "/configuracoes/impressoes", label: "Abrir impressões" };
  if (issue.area === "payments") return { href: "/configuracoes/pagamentos", label: "Abrir pagamentos" };
  if (issue.area === "delivery") return { href: "/entregas", label: "Abrir entregas" };
  return { href: "/pedidos", label: issue.area === "orders" ? "Abrir pedidos" : "Abrir operação" };
}

export function OperationalHealthIndicator({ storeId, snapshot, canMonitorPrinting = false }: { storeId: string | null; snapshot: OperationalHealthSnapshot; canMonitorPrinting?: boolean }) {
  const [connection, setConnection] = useState<"connecting" | "connected" | "degraded">("connecting");
  const [printing, setPrinting] = useState<PrintingSafetyUpdate | null>(null);
  useEffect(() => {
    if (!storeId || !canMonitorPrinting) return;
    let active = true;
    let controller: AbortController | null = null;
    const refresh = async () => {
      if (!active || controller || document.visibilityState !== "visible") return;
      const current = new AbortController();
      controller = current;
      const timeout = window.setTimeout(() => current.abort(), 10_000);
      try {
        const next = await readPrintingSafety(storeId, current.signal);
        if (active) setPrinting(next);
      } catch {
        if (active) setPrinting({ storeId, issues: [{
          id: "printing-check-unavailable", area: "printing", origin: "integration", severity: "P1",
          title: "Não foi possível conferir a impressão",
          cause: "A consulta de impressão não respondeu ou a sessão precisa ser atualizada.",
          impact: "O painel não consegue confirmar a situação atual da impressão.",
          action: "Confira os pedidos no painel e a conexão. Abra Impressões para verificar o computador responsável.",
        }] });
      } finally {
        window.clearTimeout(timeout);
        if (controller === current) controller = null;
      }
    };
    const refreshVisible = () => { void refresh(); };
    const timer = window.setInterval(refreshVisible, PRINTING_SAFETY_POLL_MS);
    window.addEventListener("online", refreshVisible);
    document.addEventListener("visibilitychange", refreshVisible);
    void refresh();
    return () => {
      active = false;
      controller?.abort();
      window.clearInterval(timer);
      window.removeEventListener("online", refreshVisible);
      document.removeEventListener("visibilitychange", refreshVisible);
    };
  }, [storeId, canMonitorPrinting]);
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
  const issues = useMemo(() => {
    const currentPrinting = canMonitorPrinting && printing?.storeId === storeId ? printing.issues : null;
    return [...snapshot.issues.filter((issue) => currentPrinting === null || issue.area !== "printing"), ...(currentPrinting ?? [])]
      .sort((a, b) => rank[a.severity] - rank[b.severity]);
  }, [snapshot.issues, printing, storeId, canMonitorPrinting]);
  const printWarning = issues.find((issue) => issue.area === "printing");
  const worst = connection === "degraded" ? "P0" : issues[0]?.severity ?? null;
  const label = worst === "P0" ? "Ação imediata" : worst === "P1" ? "Atenção operacional" : connection === "connecting" ? "Conferindo operação…" : "Operação saudável";
  return <details className="operational-health" data-severity={worst ?? "healthy"}>
    <summary aria-label={`Saúde operacional: ${label}`}>{printWarning ? "Impressão precisa de atenção" : label}{issues.length > 0 ? ` · ${issues.length}` : ""}</summary>
    <div className="operational-health-panel">
      <header><strong>Saúde da operação</strong><span>{canMonitorPrinting ? "Impressão conferida a cada minuto com a aba visível" : "Verificação ao carregar o painel"}</span></header>
      {canMonitorPrinting ? <PrintingSafetySound key={storeId} incidentKey={issues.filter((issue) => issue.area === "printing").map((issue) => issue.id).sort().join("|")} /> : null}
      <HealthItem severity={connection === "degraded" ? "P0" : connection === "connecting" ? "P2" : "P3"} origin="integration" title="Atualização ao vivo" cause={connection === "connected" ? "Conexão ativa." : connection === "connecting" ? "Reconexão em andamento." : "A conexão ao vivo foi interrompida."} impact={connection === "degraded" ? "Mudanças podem demorar; o painel confere os dados automaticamente." : "Pedidos continuam sendo acompanhados."} action={connection === "degraded" ? "Confira a internet; não é necessário apertar F5." : "Nenhuma ação necessária."} />
      {issues.map((issue) => {
        const recovery = recoveryLink(issue);
        return <HealthItem key={issue.id} {...issue}>
          {issue.orderId ? <Link href={`/pedidos/${issue.orderId}`}>Abrir pedido</Link> : null}
          <Link href={recovery.href}>{recovery.label}</Link>
          {issue.jobId ? <form action={retryPrintJobAction}><input type="hidden" name="jobId" value={issue.jobId} /><button type="submit">Tentar novamente</button></form> : null}
          {issue.jobId ? <details className="operational-health-manual"><summary>Já imprimiu por outro meio?</summary><form action={recognizePrintedJobAction}><input type="hidden" name="jobId" value={issue.jobId} /><input name="reason" required minLength={5} maxLength={500} placeholder="Como confirmou a impressão?" /><label><input type="checkbox" name="confirmed" required /> Confirmo que o documento realmente foi impresso</label><button type="submit">Reconhecer manualmente</button></form></details> : null}
        </HealthItem>;
      })}
      {issues.length === 0 && connection === "connected" ? <p className="operational-health-ok">Pedidos, entregas, impressão, pagamentos e atualização ao vivo não apresentam bloqueios conhecidos.</p> : null}
    </div>
  </details>;
}

function HealthItem({ severity, origin, title, cause, impact, action, children }: { severity: HealthSeverity; origin?: OperationalHealthOrigin; title: string; cause: string; impact: string; action: string; children?: ReactNode }) {
  return <article className="operational-health-item" data-severity={severity}><div><strong>{severity} · {title}</strong>{origin ? <small>Origem: {originLabel[origin]}</small> : null}<p><b>Causa:</b> {cause}</p><p><b>Impacto:</b> {impact}</p><p><b>Próxima ação:</b> {action}</p></div>{children ? <div className="operational-health-actions">{children}</div> : null}</article>;
}
