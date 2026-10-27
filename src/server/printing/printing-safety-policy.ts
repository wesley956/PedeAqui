import type { OperationalHealthIssue } from "@/server/operations/operational-health-service";

export const PRINTING_SAFETY_STALE_MS = 2 * 60_000;
export type PrintingSafetyAgent = { id: string; status: string; last_seen_at: string | null };
export type PrintingSafetyPrinter = { id: string; agent_id: string | null; status: string; last_seen_at: string | null };
export type PrintingSafetyJob = { status: string; created_at: string };

export function printingSafetyIssues(agents: PrintingSafetyAgent[], printers: PrintingSafetyPrinter[], jobs: PrintingSafetyJob[], now = Date.now(), configured = agents.length > 0 || printers.length > 0): OperationalHealthIssue[] {
  if (!configured && jobs.length === 0) return [];
  const fresh = (status: string, seen: string | null) => status === "online" && seen !== null
    && Number.isFinite(Date.parse(seen)) && now - Date.parse(seen) < PRINTING_SAFETY_STALE_MS;
  const liveAgents = new Set(agents.filter((agent) => fresh(agent.status, agent.last_seen_at)).map((agent) => agent.id));
  const offlinePrinters = printers.filter((printer) => !printer.agent_id || !liveAgents.has(printer.agent_id) || !fresh(printer.status, printer.last_seen_at));
  const failed = jobs.filter((job) => job.status === "failed");
  const delayed = jobs.filter((job) => job.status !== "failed" && now - Date.parse(job.created_at) >= PRINTING_SAFETY_STALE_MS);
  const issues: OperationalHealthIssue[] = [];
  if (printers.length === 0 || offlinePrinters.length > 0) issues.push({
    id: "printing-destination-unavailable", area: "printing", origin: "local_equipment",
    severity: jobs.length > 0 ? "P0" : "P1",
    title: "Confira a impressão dos pedidos",
    cause: printers.length === 0 ? "Não há uma impressora ativa configurada." : "Uma impressora ou o computador responsável está sem comunicação recente.",
    impact: jobs.length > 0 ? "Há documentos na fila que podem não ter saído em papel." : "Novos pedidos podem ficar aguardando impressão.",
    action: "Confira o pedido no painel. No computador da impressora, verifique internet, energia, papel e abra Impressões. Evite reenviar o pedido.",
  });
  if (failed.length > 0 || delayed.length > 0) issues.push({
    id: "printing-documents-delayed", area: "printing", origin: "local_equipment", severity: "P0",
    title: failed.length > 0 ? "Há impressão com falha" : "Há impressão aguardando há mais de 2 minutos",
    cause: failed.length > 0 ? "Um documento não concluiu as tentativas de impressão." : "O processamento da fila não foi confirmado no tempo esperado.",
    impact: "Confira os pedidos no painel para a cozinha não depender apenas do papel.",
    action: "Abra Impressões e confira os documentos pendentes. Antes de reimprimir, verifique se alguma via já saiu.",
  });
  return issues;
}
