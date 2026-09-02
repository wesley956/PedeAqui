import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { NavigationAccess } from "@/server/access/navigation-access-service";

export type HealthSeverity = "P0" | "P1" | "P2" | "P3";
export type OperationalHealthIssue = {
  id: string;
  area: "printing" | "payments";
  severity: HealthSeverity;
  title: string;
  cause: string;
  impact: string;
  action: string;
  jobId?: string;
  orderId?: string | null;
};
export type OperationalHealthSnapshot = { checkedAt: string; printingConfigured: boolean; issues: OperationalHealthIssue[] };

const staleAgentMs = 2 * 60_000;
const stuckJobMs = 2 * 60_000;

export class OperationalHealthService {
  static async load(access: NavigationAccess): Promise<OperationalHealthSnapshot> {
    const { context } = access;
    if (!context.storeId) return { checkedAt: new Date().toISOString(), printingConfigured: false, issues: [] };
    const admin = createAdminClient();
    const since24h = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
    const [agents, printers, jobs, paymentConfigs, charges] = await Promise.all([
      admin.from("print_agents").select("id,status,last_seen_at,last_error").eq("organization_id", context.organizationId).eq("store_id", context.storeId).eq("active", true),
      admin.from("printers").select("id,status,last_seen_at,last_error").eq("organization_id", context.organizationId).eq("store_id", context.storeId).eq("active", true),
      admin.from("print_jobs").select("id,order_id,status,attempts,max_attempts,last_error,created_at,updated_at").eq("organization_id", context.organizationId).eq("store_id", context.storeId).in("status", ["pending", "processing", "failed"]).order("created_at").limit(20),
      admin.from("order_payment_provider_configs").select("provider,enabled,last_health_status,last_health_checked_at,last_error_code").eq("organization_id", context.organizationId).eq("store_id", context.storeId).eq("enabled", true),
      admin.from("order_payment_provider_charges").select("id,order_id,status,last_error_code,created_at,updated_at,expires_at").eq("organization_id", context.organizationId).eq("store_id", context.storeId).in("status", ["creating", "pending", "failed"]).gte("created_at", since24h).order("created_at", { ascending: false }).limit(20),
    ]);
    for (const result of [agents, printers, jobs, paymentConfigs, charges]) if (result.error) throw result.error;
    const now = Date.now();
    const printingConfigured = (agents.data?.length ?? 0) > 0 || (printers.data?.length ?? 0) > 0;
    const issues: OperationalHealthIssue[] = [];
    const failedJobs = (jobs.data ?? []).filter((job) => job.status === "failed");
    const waitingJobs = (jobs.data ?? []).filter((job) => job.status !== "failed" && now - Date.parse(job.created_at) >= stuckJobMs);
    const onlineAgents = (agents.data ?? []).filter((agent) => agent.status === "online" && agent.last_seen_at && now - Date.parse(agent.last_seen_at) < staleAgentMs);
    if (printingConfigured && onlineAgents.length === 0) issues.push({
      id: "printing-agent-offline", area: "printing", severity: failedJobs.length + waitingJobs.length > 0 ? "P0" : "P1",
      title: "Computador de impressão sem sinal", cause: "O Print Agent não enviou heartbeat nos últimos 2 minutos.",
      impact: failedJobs.length + waitingJobs.length > 0 ? `${failedJobs.length + waitingJobs.length} impressão(ões) podem não ter saído.` : "Novos pedidos podem não imprimir automaticamente.",
      action: "Abra Impressões, confirme que o computador está ligado e reinicie o agente.",
    });
    for (const job of failedJobs.slice(0, 3)) issues.push({
      id: `print-job-${job.id}`, area: "printing", severity: failedJobs.length >= 2 ? "P0" : "P1",
      title: "Impressão falhou", cause: "A fila esgotou as tentativas automáticas deste documento.",
      impact: job.order_id ? "O pedido pode não ter chegado em papel ao setor responsável." : "O documento solicitado pode não ter sido impresso.",
      action: "Tente novamente ou confira o pedido antes de reconhecer uma impressão manual.", jobId: job.id, orderId: job.order_id,
    });
    if (waitingJobs.length > 0) issues.push({
      id: "printing-queue-stuck", area: "printing", severity: "P0", title: "Fila de impressão parada",
      cause: `${waitingJobs.length} documento(s) aguardam há mais de 2 minutos.`, impact: "A cozinha ou expedição pode trabalhar sem a via impressa.",
      action: "Verifique o agente e redirecione ou tente os documentos pendentes em Impressões.",
    });
    for (const config of paymentConfigs.data ?? []) if (config.last_health_status === "error") issues.push({
      id: `payment-provider-${config.provider}`, area: "payments", severity: "P1", title: "Pagamento online indisponível",
      cause: `O provedor ${config.provider} informou falha de conexão.`, impact: "Novas cobranças online podem não ser criadas ou confirmadas.",
      action: "Abra Pagamentos e teste a conexão. Formas manuais continuam seguindo a configuração do restaurante.",
    });
    for (const charge of (charges.data ?? []).filter((item) => item.status === "failed").slice(0, 3)) issues.push({
      id: `payment-charge-${charge.id}`, area: "payments", severity: "P1", title: "Cobrança online falhou",
      cause: "A confirmação do provedor não foi concluída.", impact: "O pedido continua com pagamento não confirmado; não presuma que foi pago.",
      action: "Abra o pedido, confira o comprovante/provedor e escolha a ação segura.", orderId: charge.order_id,
    });
    return { checkedAt: new Date().toISOString(), printingConfigured, issues };
  }
}
