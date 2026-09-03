import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { NavigationAccess } from "@/server/access/navigation-access-service";
import {
  OPERATIONAL_HEALTH_THRESHOLDS,
  checkoutFailureBurst,
  hasUnrecoveredRealtimeFailure,
  isConfirmedOrderStale,
  isDeliveryRouteLate,
  isPendingOrderStuck,
  minutesSince,
} from "@/server/operations/operational-health-policy";

export type HealthSeverity = "P0" | "P1" | "P2" | "P3";
export type OperationalHealthArea = "printing" | "payments" | "orders" | "delivery" | "realtime" | "checkout";
export type OperationalHealthOrigin = "app" | "integration" | "local_equipment";
export type OperationalHealthIssue = {
  id: string;
  area: OperationalHealthArea;
  origin: OperationalHealthOrigin;
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
    const now = Date.now();
    const since24h = new Date(now - 24 * 60 * 60_000).toISOString();
    const telemetrySince = new Date(now - OPERATIONAL_HEALTH_THRESHOLDS.telemetryWindowMs).toISOString();
    const [agents, printers, jobs, paymentConfigs, charges, orders, deliveries, experienceEvents] = await Promise.all([
      admin.from("print_agents").select("id,status,last_seen_at,last_error").eq("organization_id", context.organizationId).eq("store_id", context.storeId).eq("active", true),
      admin.from("printers").select("id,status,last_seen_at,last_error").eq("organization_id", context.organizationId).eq("store_id", context.storeId).eq("active", true),
      admin.from("print_jobs").select("id,order_id,status,attempts,max_attempts,last_error,created_at,updated_at").eq("organization_id", context.organizationId).eq("store_id", context.storeId).in("status", ["pending", "processing", "failed"]).order("created_at").limit(20),
      admin.from("order_payment_provider_configs").select("provider,enabled,last_health_status,last_health_checked_at,last_error_code").eq("organization_id", context.organizationId).eq("store_id", context.storeId).eq("enabled", true),
      admin.from("order_payment_provider_charges").select("id,order_id,status,last_error_code,created_at,updated_at,expires_at").eq("organization_id", context.organizationId).eq("store_id", context.storeId).in("status", ["creating", "pending", "failed"]).gte("created_at", since24h).order("created_at", { ascending: false }).limit(20),
      admin.from("orders").select("id,order_status,created_at,updated_at,scheduled_for").eq("organization_id", context.organizationId).eq("store_id", context.storeId).in("order_status", ["pending_confirmation", "confirmed"]).order("created_at").limit(50),
      admin.from("deliveries").select("id,order_id,promised_by_at,out_for_delivery_at,delivered_at,canceled_at,updated_at").eq("organization_id", context.organizationId).eq("store_id", context.storeId).not("out_for_delivery_at", "is", null).order("updated_at", { ascending: false }).limit(50),
      admin.from("product_experience_events").select("event_name,outcome,occurred_at,metadata").eq("organization_id", context.organizationId).eq("store_id", context.storeId).in("event_name", ["px.realtime.connection", "px.checkout.step"]).gte("occurred_at", telemetrySince).order("occurred_at", { ascending: false }).limit(100),
    ]);
    for (const result of [agents, printers, jobs, paymentConfigs, charges, orders, deliveries, experienceEvents]) if (result.error) throw result.error;

    const printingConfigured = (agents.data?.length ?? 0) > 0 || (printers.data?.length ?? 0) > 0;
    const issues: OperationalHealthIssue[] = [];
    const failedJobs = (jobs.data ?? []).filter((job) => job.status === "failed");
    const waitingJobs = (jobs.data ?? []).filter((job) => job.status !== "failed" && now - Date.parse(job.created_at) >= stuckJobMs);
    const onlineAgents = (agents.data ?? []).filter((agent) => agent.status === "online" && agent.last_seen_at && now - Date.parse(agent.last_seen_at) < staleAgentMs);

    if (printingConfigured && onlineAgents.length === 0) issues.push({
      id: "printing-agent-offline", area: "printing", origin: "local_equipment", severity: failedJobs.length + waitingJobs.length > 0 ? "P0" : "P1",
      title: "Computador de impressão sem sinal", cause: "O Print Agent não enviou heartbeat nos últimos 2 minutos.",
      impact: failedJobs.length + waitingJobs.length > 0 ? `${failedJobs.length + waitingJobs.length} impressão(ões) podem não ter saído.` : "Novos pedidos podem não imprimir automaticamente.",
      action: "Abra Impressões, confirme que o computador está ligado e reinicie o agente.",
    });
    for (const job of failedJobs.slice(0, 3)) issues.push({
      id: `print-job-${job.id}`, area: "printing", origin: "local_equipment", severity: failedJobs.length >= 2 ? "P0" : "P1",
      title: "Impressão falhou", cause: "A fila esgotou as tentativas automáticas deste documento.",
      impact: job.order_id ? "O pedido pode não ter chegado em papel ao setor responsável." : "O documento solicitado pode não ter sido impresso.",
      action: "Tente novamente ou confira o pedido antes de reconhecer uma impressão manual.", jobId: job.id, orderId: job.order_id,
    });
    if (waitingJobs.length > 0) issues.push({
      id: "printing-queue-stuck", area: "printing", origin: "local_equipment", severity: "P0", title: "Fila de impressão parada",
      cause: `${waitingJobs.length} documento(s) aguardam há mais de 2 minutos.`, impact: "A cozinha ou expedição pode trabalhar sem a via impressa.",
      action: "Verifique o agente e redirecione ou tente os documentos pendentes em Impressões.",
    });

    for (const config of paymentConfigs.data ?? []) if (config.last_health_status === "error") issues.push({
      id: `payment-provider-${config.provider}`, area: "payments", origin: "integration", severity: "P1", title: "Pagamento online indisponível",
      cause: `O provedor ${config.provider} informou falha de conexão.`, impact: "Novas cobranças online podem não ser criadas ou confirmadas.",
      action: "Abra Pagamentos e teste a conexão. Formas manuais continuam seguindo a configuração do restaurante.",
    });
    for (const charge of (charges.data ?? []).filter((item) => item.status === "failed").slice(0, 3)) issues.push({
      id: `payment-charge-${charge.id}`, area: "payments", origin: "integration", severity: "P1", title: "Cobrança online falhou",
      cause: "A confirmação do provedor não foi concluída.", impact: "O pedido continua com pagamento não confirmado; não presuma que foi pago.",
      action: "Abra o pedido, confira o comprovante/provedor e escolha a ação segura.", orderId: charge.order_id,
    });

    for (const order of (orders.data ?? []).filter((item) => isPendingOrderStuck({ orderStatus: item.order_status, createdAt: item.created_at, scheduledFor: item.scheduled_for, now })).slice(0, 3)) {
      const age = minutesSince(order.created_at, now) ?? 0;
      issues.push({
        id: `order-pending-${order.id}`, area: "orders", origin: "app", severity: "P1", title: "Pedido aguardando confirmação há muito tempo",
        cause: `O pedido está pendente há ${age} minuto(s).`, impact: "O cliente pode estar aguardando resposta do estabelecimento.",
        action: "Abra o pedido e confirme, rejeite ou investigue antes de repetir qualquer ação.", orderId: order.id,
      });
    }
    for (const order of (orders.data ?? []).filter((item) => isConfirmedOrderStale({ orderStatus: item.order_status, updatedAt: item.updated_at, now })).slice(0, 3)) {
      const age = minutesSince(order.updated_at, now) ?? 0;
      issues.push({
        id: `order-stale-${order.id}`, area: "orders", origin: "app", severity: "P1", title: "Pedido confirmado sem avanço",
        cause: `O pedido não recebe atualização há ${age} minuto(s).`, impact: "Produção, retirada ou entrega pode ter parado sem conclusão registrada.",
        action: "Abra o pedido, confira a etapa real e use somente a próxima transição permitida.", orderId: order.id,
      });
    }

    for (const delivery of (deliveries.data ?? []).filter((item) => isDeliveryRouteLate({
      outForDeliveryAt: item.out_for_delivery_at,
      deliveredAt: item.delivered_at,
      canceledAt: item.canceled_at,
      promisedByAt: item.promised_by_at,
      now,
    })).slice(0, 3)) {
      const age = minutesSince(delivery.out_for_delivery_at, now) ?? 0;
      issues.push({
        id: `delivery-late-${delivery.id}`, area: "delivery", origin: "app", severity: "P1", title: "Entrega em rota acima do esperado",
        cause: `A entrega está em rota há ${age} minuto(s) ou ultrapassou a promessa configurada.`, impact: "O cliente pode estar esperando uma entrega atrasada.",
        action: "Abra a Central de Entregas, confirme a situação com o entregador e atualize somente o estado real.", orderId: delivery.order_id,
      });
    }

    const telemetry = (experienceEvents.data ?? []).map((event) => ({
      event_name: event.event_name,
      outcome: event.outcome,
      occurred_at: event.occurred_at,
      metadata: event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata) ? event.metadata as Record<string, unknown> : null,
    }));
    if (hasUnrecoveredRealtimeFailure(telemetry)) issues.push({
      id: "realtime-degraded", area: "realtime", origin: "integration", severity: "P1", title: "Atualização ao vivo apresentou falha recente",
      cause: "A última telemetria de Realtime da unidade terminou em estado degradado.", impact: "Mudanças podem aparecer com atraso, embora a reconciliação periódica continue ativa.",
      action: "Confira a internet e aguarde a reconexão automática; não repita ações já confirmadas.",
    });
    const checkoutFailures = checkoutFailureBurst(telemetry);
    if (checkoutFailures >= OPERATIONAL_HEALTH_THRESHOLDS.checkoutFailureThreshold) issues.push({
      id: "checkout-failure-burst", area: "checkout", origin: "app", severity: "P1", title: "Falhas repetidas no checkout",
      cause: `${checkoutFailures} falhas de checkout foram registradas nos últimos 10 minutos.`, impact: "Clientes podem estar encontrando dificuldade para concluir novos pedidos.",
      action: "Revise o status da loja e integrações; preserve pedidos já criados e evite tentativas manuais duplicadas.",
    });

    return { checkedAt: new Date().toISOString(), printingConfigured, issues };
  }
}
