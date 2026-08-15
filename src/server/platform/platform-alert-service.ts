import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { PlatformAdminService } from "@/server/platform/platform-admin-service";

type Severity = "P0" | "P1" | "P2" | "P3";
type Alert = {
  key: string;
  severity: Severity;
  title: string;
  detail: string;
  organizationId: string | null;
  organizationName: string;
  storeId: string | null;
  storeName: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  source: string;
  href: string;
};

function alertRank(value: Severity) {
  return { P0: 0, P1: 1, P2: 2, P3: 3 }[value];
}

function unitHref(organizationId: string, storeId: string) {
  return `/platform/empresas/${organizationId}/unidades/${storeId}`;
}

function safeAgeLabel(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.floor(hours / 24)} d`;
}

export class PlatformAlertService {
  static async load() {
    await PlatformAdminService.access();
    const admin = createAdminClient();
    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

    const [organizations, stores, menuSettings, whatsapp, agents, subscriptions, pendingOrders, staleOrders, incidents, resolved] = await Promise.all([
      admin.from("organizations").select("id,name"),
      admin.from("stores").select("id,organization_id,name,status").eq("status", "active"),
      admin.from("store_menu_settings").select("organization_id,store_id,active,accepting_orders"),
      admin.from("store_conversation_settings").select("organization_id,store_id,whatsapp_enabled,whatsapp_phone_number_id,whatsapp_business_account_id,access_token_secret_ref,app_secret_secret_ref"),
      admin.from("print_agents").select("id,organization_id,store_id,active,status,last_seen_at").eq("active", true),
      admin.from("organization_subscriptions").select("organization_id,status,updated_at").eq("status", "past_due"),
      admin.from("orders").select("id,organization_id,store_id,display_number,order_status,created_at,updated_at").eq("order_status", "pending_confirmation").lt("created_at", fifteenMinutesAgo).order("created_at", { ascending: true }).limit(200),
      admin.from("orders").select("id,organization_id,store_id,display_number,order_status,created_at,updated_at").in("order_status", ["confirmed"]).lt("updated_at", oneHourAgo).order("updated_at", { ascending: true }).limit(200),
      admin.from("platform_incidents").select("fingerprint,severity,status,title,summary,organization_id,store_id,first_seen_at,last_seen_at,category").neq("status", "resolved").order("last_seen_at", { ascending: false }).limit(300),
      admin.from("platform_incidents").select("fingerprint,severity,title,organization_id,store_id,resolved_at,last_seen_at").eq("status", "resolved").order("resolved_at", { ascending: false }).limit(30),
    ]);
    for (const result of [organizations, stores, menuSettings, whatsapp, agents, subscriptions, pendingOrders, staleOrders, incidents, resolved]) {
      if (result.error) throw result.error;
    }

    const orgName = new Map((organizations.data ?? []).map((item) => [item.id, item.name]));
    const storeName = new Map((stores.data ?? []).map((item) => [item.id, item.name]));
    const menuByStore = new Map((menuSettings.data ?? []).map((item) => [item.store_id, item]));
    const alerts = new Map<string, Alert>();
    const add = (item: Alert) => {
      const current = alerts.get(item.key);
      if (!current || alertRank(item.severity) < alertRank(current.severity)) alerts.set(item.key, item);
    };

    for (const store of stores.data ?? []) {
      const menu = menuByStore.get(store.id);
      if (!menu || !menu.active || !menu.accepting_orders) {
        add({
          key: `sales-readiness:${store.id}`, severity: "P1", title: "Unidade incapaz de receber pedidos",
          detail: !menu ? "Configuração-base do cardápio ausente." : !menu.active ? "Cardápio está despublicado." : "Recebimento de pedidos está pausado.",
          organizationId: store.organization_id, organizationName: orgName.get(store.organization_id) ?? "Empresa indisponível",
          storeId: store.id, storeName: store.name, firstSeenAt: store.id, lastSeenAt: new Date().toISOString(), source: "readiness",
          href: unitHref(store.organization_id, store.id),
        });
      }
    }

    for (const setting of whatsapp.data ?? []) {
      if (!setting.whatsapp_enabled) continue;
      const complete = Boolean(setting.whatsapp_phone_number_id && setting.whatsapp_business_account_id && setting.access_token_secret_ref && setting.app_secret_secret_ref);
      if (!complete) add({
        key: `whatsapp-config:${setting.store_id}`, severity: "P1", title: "WhatsApp exige reconexão/configuração",
        detail: "O canal está habilitado, mas a configuração necessária não está completa.",
        organizationId: setting.organization_id, organizationName: orgName.get(setting.organization_id) ?? "Empresa indisponível",
        storeId: setting.store_id, storeName: storeName.get(setting.store_id) ?? "Unidade indisponível", firstSeenAt: new Date().toISOString(), lastSeenAt: new Date().toISOString(), source: "whatsapp",
        href: "/platform/integracoes",
      });
    }

    for (const agent of agents.data ?? []) {
      const stale = !agent.last_seen_at || agent.last_seen_at < fiveMinutesAgo;
      if (agent.status !== "online" || stale) add({
        key: `print-agent:${agent.store_id}:${agent.id}`, severity: "P2", title: "Agente de impressão offline",
        detail: stale ? "Heartbeat do agente está atrasado." : "Agente informou estado diferente de online.",
        organizationId: agent.organization_id, organizationName: orgName.get(agent.organization_id) ?? "Empresa indisponível",
        storeId: agent.store_id, storeName: storeName.get(agent.store_id) ?? "Unidade indisponível", firstSeenAt: agent.last_seen_at ?? new Date().toISOString(), lastSeenAt: agent.last_seen_at ?? new Date().toISOString(), source: "printing",
        href: "/platform/integracoes",
      });
    }

    for (const subscription of subscriptions.data ?? []) add({
      key: `billing:${subscription.organization_id}`, severity: "P2", title: "Assinatura exige atenção de cobrança",
      detail: "A assinatura está com ação financeira/comercial pendente; nenhuma correção automática será aplicada.",
      organizationId: subscription.organization_id, organizationName: orgName.get(subscription.organization_id) ?? "Empresa indisponível",
      storeId: null, storeName: null, firstSeenAt: subscription.updated_at, lastSeenAt: subscription.updated_at, source: "billing", href: "/platform/assinaturas",
    });

    for (const order of pendingOrders.data ?? []) add({
      key: `order-pending:${order.id}`, severity: "P1", title: `Pedido #${order.display_number} aguardando aceite`,
      detail: `Sem confirmação há ${safeAgeLabel(order.created_at)}.`, organizationId: order.organization_id,
      organizationName: orgName.get(order.organization_id) ?? "Empresa indisponível", storeId: order.store_id,
      storeName: storeName.get(order.store_id) ?? "Unidade indisponível", firstSeenAt: order.created_at, lastSeenAt: order.updated_at, source: "orders", href: `/platform/operacao/pedidos/${order.id}`,
    });

    for (const order of staleOrders.data ?? []) add({
      key: `order-stale:${order.id}`, severity: "P2", title: `Pedido #${order.display_number} sem avanço recente`,
      detail: `Pedido confirmado sem atualização há ${safeAgeLabel(order.updated_at)}.`, organizationId: order.organization_id,
      organizationName: orgName.get(order.organization_id) ?? "Empresa indisponível", storeId: order.store_id,
      storeName: storeName.get(order.store_id) ?? "Unidade indisponível", firstSeenAt: order.updated_at, lastSeenAt: order.updated_at, source: "orders", href: `/platform/operacao/pedidos/${order.id}`,
    });

    for (const incident of incidents.data ?? []) add({
      key: `incident:${incident.fingerprint}`, severity: incident.severity as Severity, title: incident.title,
      detail: incident.summary, organizationId: incident.organization_id, organizationName: incident.organization_id ? (orgName.get(incident.organization_id) ?? "Empresa indisponível") : "Plataforma",
      storeId: incident.store_id, storeName: incident.store_id ? (storeName.get(incident.store_id) ?? "Unidade indisponível") : null,
      firstSeenAt: incident.first_seen_at, lastSeenAt: incident.last_seen_at, source: incident.category, href: "/platform/incidentes",
    });

    const current = [...alerts.values()].sort((a, b) => alertRank(a.severity) - alertRank(b.severity) || a.firstSeenAt.localeCompare(b.firstSeenAt));
    return {
      alerts: current,
      resolved: (resolved.data ?? []).map((item) => ({
        key: item.fingerprint, severity: item.severity as Severity, title: item.title,
        organizationName: item.organization_id ? (orgName.get(item.organization_id) ?? "Empresa indisponível") : "Plataforma",
        storeName: item.store_id ? (storeName.get(item.store_id) ?? "Unidade indisponível") : null,
        resolvedAt: item.resolved_at ?? item.last_seen_at,
      })),
      totals: {
        p0: current.filter((item) => item.severity === "P0").length,
        p1: current.filter((item) => item.severity === "P1").length,
        p2: current.filter((item) => item.severity === "P2").length,
        p3: current.filter((item) => item.severity === "P3").length,
        organizations: new Set(current.map((item) => item.organizationId).filter(Boolean)).size,
      },
    };
  }
}
