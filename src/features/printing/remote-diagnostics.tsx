import { randomUUID } from "node:crypto";
import Link from "next/link";
import { AuthorizationError } from "@/server/access/authorize";
import { PrintAgentDiagnosticService } from "@/server/printing/print-agent-diagnostic-service";
import { diagnosticReportSchema, type DiagnosticRequestRow } from "@/features/printing/diagnostic-contract";
import { cancelAgentDiagnosticAction, requestAgentDiagnosticAction } from "@/features/printing/actions";

const checkLabels = {
  runtime: "Funcionamento do computador", storage: "Gravação local", startup: "Inicialização do Windows",
  processes: "Processos do agente", spooler: "Serviço de impressão", printers: "Epson e fila do Windows",
  power: "Suspensão do computador", connectivity: "Acesso ao PedeAqui", authentication: "Conexão com a loja", updates: "Acesso às atualizações",
};
const statuses = { ok: "Verificado", warning: "Precisa de atenção", error: "Falha", unavailable: "Não foi possível verificar", timeout: "Tempo limite atingido" };
const valueLabels: Record<string, string> = {
  uptimeSeconds: "Tempo ligado (segundos)", freeMemoryMb: "Memória livre (MB)", writable: "Gravação disponível",
  taskFound: "Inicialização encontrada", taskState: "Estado da tarefa", lastTaskResult: "Último resultado da tarefa",
  blocksBattery: "Inicialização bloqueada na bateria", stopsOnBattery: "Interrompe ao usar bateria", agentProcesses: "Processos encontrados",
  startsAtBoot: "Inicia ao ligar o Windows", startsAtLogin: "Inicia ao entrar no Windows", serviceAccount: "Usa conta de serviço",
  serviceRunning: "Serviço em execução", printerCount: "Epsons encontradas", offlineCount: "Epsons offline", errorCount: "Epsons com erro",
  queuedJobs: "Documentos na fila do Windows", sleepOnAc: "Suspensão automática na tomada", sleepOnBattery: "Suspensão automática na bateria",
  httpStatus: "Resposta da conexão", assignedPrinters: "Impressoras vinculadas à loja",
};
function date(value: string) { return new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }); }

type DiagnosticSnapshot = { status: "ready" | "hidden" | "unavailable"; requests: DiagnosticRequestRow[] };
export async function loadRemotePrintingDiagnostics(): Promise<DiagnosticSnapshot> {
  try { return { status: "ready", requests: await PrintAgentDiagnosticService.list() }; }
  catch (error) {
    return { status: error instanceof AuthorizationError ? "hidden" : "unavailable", requests: [] };
  }
}

export function RemotePrintingDiagnostics({ agents, snapshot }: { agents: Array<{ id: string; name: string; active: boolean; capabilities: unknown }>; snapshot: DiagnosticSnapshot }) {
  if (snapshot.status === "hidden") return null;
  if (snapshot.status === "unavailable") return <p role="status">O diagnóstico remoto está indisponível. A impressão e o diagnóstico para baixar continuam disponíveis.</p>;
  const requests = snapshot.requests;
  return <section aria-labelledby="remote-diagnostics-title">
    <h2 id="remote-diagnostics-title">Diagnóstico remoto do computador</h2>
    <p>Solicite uma conferência sem acessar o computador da loja. O relatório só é coletado quando você solicita; não imprime nem altera configurações.</p>
    <p>Se o computador estiver offline, a solicitação aguarda por até sete dias. A coleta depende de o agente conseguir iniciar, atualizar e se conectar.</p>
    <Link href="/configuracoes/impressoes">Atualizar resultados</Link>
    {agents.filter(agent => agent.active).map(agent => {
      const latest = requests.find(row => row.agent_id === agent.id);
      const pending = latest?.status === "pending";
      const capable = Boolean(agent.capabilities && typeof agent.capabilities === "object" && "onDemandDiagnostics" in agent.capabilities && agent.capabilities.onDemandDiagnostics === true);
      const parsed = diagnosticReportSchema.safeParse(latest?.report);
      return <article key={agent.id}>
        <h3>{agent.name}</h3>
        {!capable ? <p>Este computador ainda não confirmou a versão com diagnóstico remoto. A solicitação ficará aguardando a atualização e a conexão.</p> : null}
        <form action={requestAgentDiagnosticAction}>
          <input type="hidden" name="agentId" value={agent.id} />
          <input type="hidden" name="intentKey" value={randomUUID()} />
          <button type="submit" className="button secondary" disabled={pending}>Solicitar diagnóstico de {agent.name}</button>
        </form>
        {latest ? <div>
          <p>Solicitado em {date(latest.requested_at)}. {pending ? "Aguardando relatório do computador." : latest.status === "completed" ? "Relatório recebido." : latest.status === "cancelled" ? "Solicitação cancelada." : "Prazo encerrado; solicite novamente se necessário."}</p>
          {pending ? <form action={cancelAgentDiagnosticAction}>
            <input type="hidden" name="requestId" value={latest.id} />
            <button type="submit" className="button secondary">Cancelar solicitação de {agent.name}</button>
          </form> : null}
          {parsed.success ? <details>
            <summary>Ver relatório de {agent.name}</summary>
            <p>Coletado de {date(parsed.data.startedAt)} até {date(parsed.data.finishedAt)}. Versão {parsed.data.agentVersion}. O relatório descreve esse momento; não confirma saída de papel.</p>
            <ul>{parsed.data.checks.map(check => <li key={check.name}>
              <strong>{checkLabels[check.name]}: {statuses[check.status]}</strong>
              {check.code === "interrupted" ? <p>A coleta foi interrompida. Solicite outro diagnóstico para conferir novamente.</p> : null}
              {check.code === "access_denied" ? <p>O Windows não permitiu esta consulta.</p> : null}
              {check.code === "not_windows" ? <p>Esta verificação é exclusiva de Windows.</p> : null}
              <dl>{Object.entries(check.values).map(([key, value]) => <div key={key}><dt>{valueLabels[key]}</dt><dd>{typeof value === "boolean" ? value ? "Sim" : "Não" : value}</dd></div>)}</dl>
            </li>)}</ul>
          </details> : null}
        </div> : null}
      </article>;
    })}
  </section>;
}
