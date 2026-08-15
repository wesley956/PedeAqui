import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { PlatformAdminService } from "@/server/platform/platform-admin-service";

export type IntegrationHealthState = "connected" | "attention" | "action_required" | "unavailable" | "disconnected";
export type IntegrationHealthItem = {
  key: string;
  kind: "whatsapp" | "printing" | "webhook" | "billing" | "payments";
  organizationId: string | null;
  organizationName: string;
  storeId: string | null;
  storeName: string;
  state: IntegrationHealthState;
  label: string;
  impact: string;
  detail: string;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
};

const hour = 60 * 60 * 1000;
const staleAgentMs = 10 * 60 * 1000;

function safeFailure(value: string | null | undefined) {
  if (!value) return null;
  return value.replace(/Bearer\s+\S+/gi, "credencial protegida").replace(/[A-Za-z0-9_-]{32,}/g, "[dado protegido]").slice(0, 240);
}

export class PlatformIntegrationHealthService {
  static async load() {
    await PlatformAdminService.access();
    const admin = createAdminClient();
    const since24h = new Date(Date.now() - 24 * hour).toISOString();
    const [organizations, stores, whatsapp, messages, agents, printers, jobs, webhookDeliveries, billingReceipts, integrations] = await Promise.all([
      admin.from("organizations").select("id,name,status").order("name"),
      admin.from("stores").select("id,organization_id,name,status").order("name"),
      admin.from("store_conversation_settings").select("organization_id,store_id,whatsapp_enabled,provider,whatsapp_phone_number_id,access_token_secret_ref,app_secret_secret_ref,updated_at"),
      admin.from("messages").select("organization_id,store_id,direction,delivery_status,error_code,error_message,created_at,updated_at").gte("created_at", since24h).order("created_at", { ascending: false }).limit(500),
      admin.from("print_agents").select("organization_id,store_id,status,active,last_seen_at,last_error,updated_at").eq("active", true),
      admin.from("printers").select("organization_id,store_id,status,active,last_seen_at,last_error,updated_at").eq("active", true),
      admin.from("print_jobs").select("organization_id,store_id,status,last_error,printed_at,failed_at,created_at,updated_at").gte("created_at", since24h).order("created_at", { ascending: false }).limit(500),
      admin.from("integration_webhook_deliveries").select("organization_id,store_id,status,response_status,last_error,created_at,completed_at,updated_at").gte("created_at", since24h).order("created_at", { ascending: false }).limit(500),
      admin.from("billing_webhook_receipts").select("provider_key,status,error_message,created_at,processed_at,updated_at").gte("created_at", since24h).order("created_at", { ascending: false }).limit(200),
      admin.from("integrations").select("id,organization_id,store_id,kind,provider_key,active,last_health_status,last_health_checked_at,last_error,updated_at").eq("active", true),
    ]);
    for (const result of [organizations, stores, whatsapp, messages, agents, printers, jobs, webhookDeliveries, billingReceipts, integrations]) if (result.error) throw result.error;

    const orgName = new Map((organizations.data ?? []).map((row) => [row.id, row.name]));
    const storeName = new Map((stores.data ?? []).map((row) => [row.id, row.name]));
    const items: IntegrationHealthItem[] = [];

    for (const store of stores.data ?? []) {
      const orgLabel = orgName.get(store.organization_id) ?? "Empresa";
      const wa = (whatsapp.data ?? []).find((row) => row.store_id === store.id);
      const recentMessages = (messages.data ?? []).filter((row) => row.store_id === store.id);
      const failedMessages = recentMessages.filter((row) => row.direction === "outbound" && row.delivery_status === "failed");
      const latestInbound = recentMessages.find((row) => row.direction === "inbound");
      const latestOutboundSuccess = recentMessages.find((row) => row.direction === "outbound" && ["sent", "delivered", "read"].includes(row.delivery_status));
      const waConfigured = Boolean(wa?.whatsapp_phone_number_id && wa?.access_token_secret_ref && wa?.app_secret_secret_ref);
      const waState: IntegrationHealthState = !wa?.whatsapp_enabled ? "disconnected" : !waConfigured ? "action_required" : failedMessages.length > 0 ? "attention" : "connected";
      items.push({
        key: `whatsapp:${store.id}`, kind: "whatsapp", organizationId: store.organization_id, organizationName: orgLabel, storeId: store.id, storeName: store.name,
        state: waState,
        label: "WhatsApp",
        impact: waState === "action_required" || waState === "disconnected" ? "Mensagens automáticas indisponíveis; pedidos continuam operando." : waState === "attention" ? "Envios podem falhar; pedidos não são bloqueados." : "Mensagens disponíveis.",
        detail: !wa?.whatsapp_enabled ? "Canal desativado nesta unidade." : !waConfigured ? "Conexão incompleta. Reconexão/configuração necessária." : failedMessages.length > 0 ? `${failedMessages.length} envio(s) falharam nas últimas 24h. ${safeFailure(failedMessages[0]?.error_message) ?? "Verifique o canal."}` : "Configuração completa e sem falha outbound recente.",
        lastSuccessAt: latestOutboundSuccess?.updated_at ?? latestInbound?.created_at ?? null,
        lastFailureAt: failedMessages[0]?.updated_at ?? null,
      });

      const storeAgents = (agents.data ?? []).filter((row) => row.store_id === store.id);
      const storePrinters = (printers.data ?? []).filter((row) => row.store_id === store.id);
      const storeJobs = (jobs.data ?? []).filter((row) => row.store_id === store.id);
      const failedJobs = storeJobs.filter((row) => row.status === "failed");
      const latestPrint = storeJobs.find((row) => row.status === "printed");
      const onlineAgents = storeAgents.filter((agent) => agent.status === "online" && agent.last_seen_at && Date.now() - new Date(agent.last_seen_at).getTime() <= staleAgentMs);
      const hasPrinting = storePrinters.length > 0 || storeAgents.length > 0;
      const printState: IntegrationHealthState = !hasPrinting ? "disconnected" : onlineAgents.length === 0 ? "action_required" : failedJobs.length > 0 ? "attention" : "connected";
      items.push({
        key: `printing:${store.id}`, kind: "printing", organizationId: store.organization_id, organizationName: orgLabel, storeId: store.id, storeName: store.name,
        state: printState,
        label: "Impressão",
        impact: !hasPrinting ? "Sem impressão automática configurada." : onlineAgents.length === 0 ? "Impressão automática pode parar; pedido continua disponível no painel." : failedJobs.length > 0 ? "Alguns tickets precisam de atenção." : "Impressão operacional.",
        detail: !hasPrinting ? "Nenhum agente/impressora ativo." : onlineAgents.length === 0 ? "Nenhum Print Agent apresentou heartbeat recente." : failedJobs.length > 0 ? `${failedJobs.length} job(s) falharam nas últimas 24h. ${safeFailure(failedJobs[0]?.last_error) ?? "Abra o diagnóstico."}` : `${onlineAgents.length} agente(s) online e sem falha recente na fila.`,
        lastSuccessAt: latestPrint?.printed_at ?? onlineAgents[0]?.last_seen_at ?? null,
        lastFailureAt: failedJobs[0]?.failed_at ?? null,
      });

      const storeWebhook = (webhookDeliveries.data ?? []).filter((row) => row.store_id === store.id);
      if (storeWebhook.length > 0) {
        const dead = storeWebhook.filter((row) => row.status === "dead");
        const succeeded = storeWebhook.find((row) => row.status === "succeeded");
        items.push({
          key: `webhook:${store.id}`, kind: "webhook", organizationId: store.organization_id, organizationName: orgLabel, storeId: store.id, storeName: store.name,
          state: dead.length > 0 ? "attention" : "connected", label: "Integrações externas",
          impact: dead.length > 0 ? "Eventos externos podem estar atrasados; operação principal continua." : "Entrega de eventos externos normal.",
          detail: dead.length > 0 ? `${dead.length} entrega(s) chegaram à falha definitiva. ${safeFailure(dead[0]?.last_error) ?? "Reprocessamento deve usar o fluxo idempotente."}` : "Sem falha definitiva nas últimas 24h.",
          lastSuccessAt: succeeded?.completed_at ?? null, lastFailureAt: dead[0]?.updated_at ?? null,
        });
      }
    }

    for (const integration of integrations.data ?? []) {
      if (integration.kind !== "payment") continue;
      const label = integration.provider_key ? `Pagamento · ${integration.provider_key}` : "Pagamento online";
      const state: IntegrationHealthState = integration.last_health_status === "healthy" ? "connected" : integration.last_health_status === "unavailable" ? "unavailable" : integration.last_error ? "attention" : "action_required";
      items.push({ key: `payment:${integration.id}`, kind: "payments", organizationId: integration.organization_id, organizationName: orgName.get(integration.organization_id) ?? "Empresa", storeId: integration.store_id, storeName: integration.store_id ? storeName.get(integration.store_id) ?? "Unidade" : "Todas as unidades", state, label, impact: state === "connected" ? "Pagamento online disponível." : "Pagamento online pode estar indisponível; não considerar cobrança confirmada sem o provider.", detail: state === "connected" ? "Último health check saudável." : safeFailure(integration.last_error) ?? "Integração requer verificação/configuração.", lastSuccessAt: state === "connected" ? integration.last_health_checked_at : null, lastFailureAt: state !== "connected" ? integration.last_health_checked_at : null });
    }

    const failedBilling = (billingReceipts.data ?? []).filter((row) => row.status === "failed");
    const processedBilling = (billingReceipts.data ?? []).find((row) => row.status === "processed");
    items.push({ key: "billing:platform", kind: "billing", organizationId: null, organizationName: "PedeAqui", storeId: null, storeName: "Plataforma", state: failedBilling.length > 0 ? "attention" : "connected", label: "Cobrança SaaS", impact: failedBilling.length > 0 ? "Assinaturas podem exigir reconciliação; pedidos dos restaurantes não são afetados." : "Processamento de eventos de assinatura sem falha recente.", detail: failedBilling.length > 0 ? `${failedBilling.length} evento(s) de billing falharam nas últimas 24h. ${safeFailure(failedBilling[0]?.error_message) ?? "Abra o diagnóstico."}` : "Nenhuma falha de billing nas últimas 24h.", lastSuccessAt: processedBilling?.processed_at ?? null, lastFailureAt: failedBilling[0]?.updated_at ?? null });

    const priority: Record<IntegrationHealthState, number> = { action_required: 0, unavailable: 1, attention: 2, disconnected: 3, connected: 4 };
    return { items: items.sort((a, b) => priority[a.state] - priority[b.state] || a.organizationName.localeCompare(b.organizationName) || a.storeName.localeCompare(b.storeName)), totals: { connected: items.filter((item) => item.state === "connected").length, attention: items.filter((item) => item.state === "attention").length, actionRequired: items.filter((item) => item.state === "action_required").length, unavailable: items.filter((item) => item.state === "unavailable").length, disconnected: items.filter((item) => item.state === "disconnected").length } };
  }
}
