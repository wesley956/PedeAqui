import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { PlatformAdminService } from "@/server/platform/platform-admin-service";

type JsonObject = Record<string, unknown>;

function metadataObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function moneyNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function isoTime(value: string | null | undefined) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

export class PlatformBackofficeService {
  static async loadPendencies() {
    const access = await PlatformAdminService.access();
    const admin = createAdminClient();
    const now = Date.now();
    const soon = new Date(now + 3 * 86_400_000).toISOString();
    const [organizations, subscriptions, invoices, incidents, webhooks, leads] = await Promise.all([
      admin.from("organizations").select("id,name,status").order("name"),
      admin.from("organization_subscriptions").select("id,organization_id,status,payment_status,next_due_at,access_suspended_at,founder_slot").in("status", ["trialing", "active", "past_due"]).order("updated_at", { ascending: false }),
      admin.from("subscription_invoices").select("id,organization_id,status,total_amount_cents,due_at").in("status", ["pending", "overdue"]).order("due_at"),
      admin.from("platform_incidents").select("id,organization_id,severity,status,title,summary,last_seen_at").neq("status", "resolved").order("last_seen_at", { ascending: false }).limit(100),
      admin.from("billing_webhook_receipts").select("id,provider_key,status,error_message,created_at").order("created_at", { ascending: false }).limit(60),
      admin.from("platform_crm_leads").select("id,organization_id,business_name,contact_name,stage,next_action_at").not("stage", "in", "(won,lost)").order("next_action_at", { ascending: true, nullsFirst: false }).limit(100),
    ]);
    for (const result of [organizations, subscriptions, invoices, incidents, webhooks, leads]) if (result.error) throw result.error;
    const orgName = new Map((organizations.data ?? []).map((item) => [item.id, item.name]));
    const activeSubOrgs = new Set((subscriptions.data ?? []).map((item) => item.organization_id));
    const rows: Array<{ id: string; severity: "danger" | "warn" | "info"; title: string; detail: string; href: string; organizationName: string | null; createdAt: string | null }> = [];

    for (const organization of organizations.data ?? []) {
      if (organization.status === "active" && !activeSubOrgs.has(organization.id)) rows.push({
        id: `org-no-sub:${organization.id}`, severity: "warn", title: "Cliente ativo sem assinatura vigente",
        detail: "Revise o contrato comercial antes de automatizar cobrança ou entitlement.", href: `/platform/empresas/${organization.id}`,
        organizationName: organization.name, createdAt: null,
      });
    }
    for (const subscription of subscriptions.data ?? []) {
      if (subscription.access_suspended_at) rows.push({
        id: `sub-suspended:${subscription.id}`, severity: "danger", title: "Acesso suspenso",
        detail: "A assinatura possui suspensão administrativa ativa.", href: "/platform/assinaturas", organizationName: orgName.get(subscription.organization_id) ?? null, createdAt: subscription.access_suspended_at,
      });
      else if (subscription.payment_status === "overdue") rows.push({
        id: `sub-overdue:${subscription.id}`, severity: "danger", title: "Assinatura em atraso",
        detail: "Cobrança vencida requer acompanhamento antes de qualquer bloqueio.", href: "/platform/financeiro", organizationName: orgName.get(subscription.organization_id) ?? null, createdAt: subscription.next_due_at,
      });
      else if (subscription.next_due_at && subscription.next_due_at <= soon && subscription.payment_status !== "paid") rows.push({
        id: `sub-due:${subscription.id}`, severity: "warn", title: "Vencimento próximo",
        detail: `Próximo vencimento em ${new Date(subscription.next_due_at).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}.`, href: "/platform/financeiro", organizationName: orgName.get(subscription.organization_id) ?? null, createdAt: subscription.next_due_at,
      });
    }
    for (const invoice of invoices.data ?? []) if (invoice.status === "overdue" || isoTime(invoice.due_at) < now) rows.push({
      id: `invoice:${invoice.id}`, severity: "danger", title: "Mensalidade vencida",
      detail: `Valor em aberto: ${(moneyNumber(invoice.total_amount_cents) / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}.`, href: "/platform/financeiro", organizationName: orgName.get(invoice.organization_id) ?? null, createdAt: invoice.due_at,
    });
    for (const incident of incidents.data ?? []) rows.push({
      id: `incident:${incident.id}`, severity: incident.severity === "critical" || incident.severity === "high" ? "danger" : "warn",
      title: incident.title, detail: incident.summary, href: "/platform/incidentes", organizationName: incident.organization_id ? (orgName.get(incident.organization_id) ?? null) : null, createdAt: incident.last_seen_at,
    });
    for (const webhook of webhooks.data ?? []) if (["failed", "error", "rejected"].includes(webhook.status)) rows.push({
      id: `webhook:${webhook.id}`, severity: "warn", title: `Falha de integração · ${webhook.provider_key}`,
      detail: webhook.error_message?.slice(0, 180) || "Evento de integração precisa ser revisado.", href: "/platform/integracoes", organizationName: null, createdAt: webhook.created_at,
    });
    for (const lead of leads.data ?? []) if (lead.next_action_at && isoTime(lead.next_action_at) <= now) rows.push({
      id: `lead:${lead.id}`, severity: "info", title: `Follow-up comercial · ${lead.business_name}`,
      detail: `${lead.contact_name} está na etapa ${lead.stage} e possui próxima ação vencida.`, href: "/platform/comercial", organizationName: lead.organization_id ? (orgName.get(lead.organization_id) ?? null) : null, createdAt: lead.next_action_at,
    });

    const weight = { danger: 0, warn: 1, info: 2 } as const;
    rows.sort((a, b) => weight[a.severity] - weight[b.severity] || isoTime(b.createdAt) - isoTime(a.createdAt));
    return { role: access.role, rows, counts: { danger: rows.filter((item) => item.severity === "danger").length, warn: rows.filter((item) => item.severity === "warn").length, info: rows.filter((item) => item.severity === "info").length } };
  }

  static async loadFinance() {
    const access = await PlatformAdminService.access();
    const admin = createAdminClient();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const [organizations, subscriptions, addons, invoices, payments] = await Promise.all([
      admin.from("organizations").select("id,name").order("name"),
      admin.from("organization_subscriptions").select("id,organization_id,status,billing_interval,agreed_price_cents,payment_status,next_due_at,founder_slot,metadata").in("status", ["trialing", "active", "past_due"]).order("updated_at", { ascending: false }),
      admin.from("subscription_addons").select("subscription_id,unit_price_cents,quantity,status").eq("status", "active"),
      admin.from("subscription_invoices").select("id,organization_id,status,total_amount_cents,due_at,paid_at,reference_month").order("reference_month", { ascending: false }).limit(500),
      admin.from("subscription_payments").select("id,organization_id,invoice_id,amount_cents,status,paid_at,method").eq("status", "paid").gte("paid_at", thirtyDaysAgo).order("paid_at", { ascending: false }).limit(500),
    ]);
    for (const result of [organizations, subscriptions, addons, invoices, payments]) if (result.error) throw result.error;
    const addonBySubscription = new Map<string, number>();
    for (const addon of addons.data ?? []) addonBySubscription.set(addon.subscription_id, (addonBySubscription.get(addon.subscription_id) ?? 0) + addon.unit_price_cents * addon.quantity);
    const orgName = new Map((organizations.data ?? []).map((item) => [item.id, item.name]));
    const rows = (subscriptions.data ?? []).map((subscription) => {
      const base = subscription.agreed_price_cents ?? 0;
      const addon = addonBySubscription.get(subscription.id) ?? 0;
      const monthlyBase = subscription.billing_interval === "year" ? Math.round(base / 12) : base;
      return {
        id: subscription.id, organizationId: subscription.organization_id, organizationName: orgName.get(subscription.organization_id) ?? "Empresa indisponível",
        mrrCents: monthlyBase + addon, agreedPriceCents: base, addonCents: addon, paymentStatus: subscription.payment_status,
        nextDueAt: subscription.next_due_at, founder: Boolean(subscription.founder_slot), metadata: metadataObject(subscription.metadata),
      };
    });
    const mrrCents = rows.reduce((sum, item) => sum + item.mrrCents, 0);
    const overdueInvoices = (invoices.data ?? []).filter((item) => item.status === "overdue" || (item.status === "pending" && isoTime(item.due_at) < Date.now()));
    const overdueCents = overdueInvoices.reduce((sum, item) => sum + moneyNumber(item.total_amount_cents), 0);
    const received30dCents = (payments.data ?? []).reduce((sum, item) => sum + item.amount_cents, 0);
    return {
      role: access.role, rows, invoices: invoices.data ?? [], payments: payments.data ?? [],
      metrics: { mrrCents, activeContracts: rows.length, arpuCents: rows.length ? Math.round(mrrCents / rows.length) : 0, overdueCents, overdueCount: overdueInvoices.length, received30dCents },
    };
  }

  static async loadAudit() {
    const access = await PlatformAdminService.access();
    const admin = createAdminClient();
    const [organizations, operational, financial, global] = await Promise.all([
      admin.from("organizations").select("id,name"),
      admin.from("audit_logs").select("id,organization_id,actor_user_id,action,entity_type,entity_id,request_id,created_at").order("created_at", { ascending: false }).limit(300),
      admin.from("platform_financial_audit").select("id,organization_id,actor_user_id,action,entity_type,entity_id,reason,protocol,created_at").order("created_at", { ascending: false }).limit(300),
      admin.from("platform_global_audit").select("id,organization_id,actor_user_id,action,entity_type,entity_id,reason,protocol,created_at").order("created_at", { ascending: false }).limit(300),
    ]);
    for (const result of [organizations, operational, financial, global]) if (result.error) throw result.error;
    const orgName = new Map((organizations.data ?? []).map((item) => [item.id, item.name]));
    const rows = [
      ...(operational.data ?? []).map((item) => ({ ...item, source: "Operacional", reason: null as string | null, protocol: item.request_id })),
      ...(financial.data ?? []).map((item) => ({ ...item, source: "Financeiro", request_id: null as string | null })),
      ...(global.data ?? []).map((item) => ({ ...item, source: "Plataforma", request_id: null as string | null })),
    ].sort((a, b) => isoTime(b.created_at) - isoTime(a.created_at)).slice(0, 500).map((item) => ({ ...item, organizationName: item.organization_id ? (orgName.get(item.organization_id) ?? "Empresa indisponível") : null }));
    return { role: access.role, rows };
  }

  static async loadTeam() {
    const access = await PlatformAdminService.access();
    const admin = createAdminClient();
    const [{ data: admins, error }, usersResult] = await Promise.all([
      admin.from("platform_admins").select("user_id,role,active,created_at,updated_at").order("created_at"),
      admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ]);
    if (error) throw error;
    if (usersResult.error) throw usersResult.error;
    const userById = new Map(usersResult.data.users.map((user) => [user.id, user]));
    return { role: access.role, rows: (admins ?? []).map((item) => ({ ...item, email: userById.get(item.user_id)?.email ?? "Usuário indisponível", lastSignInAt: userById.get(item.user_id)?.last_sign_in_at ?? null })) };
  }

  static async loadFounders() {
    const access = await PlatformAdminService.access();
    const admin = createAdminClient();
    const [memberships, balances, levels, benefits, redemptions, organizations, subscriptions, plans] = await Promise.all([
      admin.from("founder_club_memberships").select("id,organization_id,subscription_id,status,level_key,joined_at,paused_at,removed_at,admission_source,admission_reason,terms_version,reward_unit,metadata,created_at,updated_at").order("joined_at"),
      admin.from("founder_club_member_balances").select("membership_id,organization_id,status,level_key,joined_at,reward_unit,balance_units,ledger_entries"),
      admin.from("founder_club_levels").select("key,name,description,rank,min_tenure_months,active,metadata").order("rank"),
      admin.from("founder_club_benefits").select("id,key,name,description,kind,cost_units,active,stock_limit,starts_at,ends_at,metadata").order("created_at", { ascending: false }),
      admin.from("founder_club_redemptions").select("id,membership_id,organization_id,benefit_id,status,units_spent,requested_at,decided_at,fulfilled_at").order("requested_at", { ascending: false }).limit(200),
      admin.from("organizations").select("id,name"),
      admin.from("organization_subscriptions").select("id,organization_id,plan_id,status,agreed_price_cents,price_locked,founder_slot,next_due_at,payment_status,metadata").order("updated_at", { ascending: false }),
      admin.from("plans").select("id,key,name"),
    ]);
    for (const result of [memberships, balances, levels, benefits, redemptions, organizations, subscriptions, plans]) if (result.error) throw result.error;
    const orgName = new Map((organizations.data ?? []).map((item) => [item.id, item.name]));
    const balanceByMember = new Map((balances.data ?? []).map((item) => [item.membership_id, item]));
    const subById = new Map((subscriptions.data ?? []).map((item) => [item.id, item]));
    const planById = new Map((plans.data ?? []).map((item) => [item.id, item]));
    const rows = (memberships.data ?? []).map((membership) => {
      const subscription = membership.subscription_id ? subById.get(membership.subscription_id) : null;
      const metadata = metadataObject(subscription?.metadata);
      return {
        ...membership, organizationName: orgName.get(membership.organization_id) ?? "Empresa indisponível",
        balanceUnits: moneyNumber(balanceByMember.get(membership.id)?.balance_units), ledgerEntries: moneyNumber(balanceByMember.get(membership.id)?.ledger_entries),
        contractPlan: subscription ? (planById.get(subscription.plan_id)?.name ?? "Plano indisponível") : null,
        founderSlot: subscription?.founder_slot ?? null, agreedPriceCents: subscription?.agreed_price_cents ?? null, priceLocked: subscription?.price_locked ?? false,
        nextDueAt: subscription?.next_due_at ?? null, paymentStatus: subscription?.payment_status ?? null,
        functionalPlanLabel: typeof metadata.functional_plan_label === "string" ? metadata.functional_plan_label : null,
      };
    });
    return { role: access.role, rows, levels: levels.data ?? [], benefits: benefits.data ?? [], redemptions: redemptions.data ?? [] };
  }

  static async loadCrm() {
    const access = await PlatformAdminService.access();
    const admin = createAdminClient();
    const [leads, activities] = await Promise.all([
      admin.from("platform_crm_leads").select("id,organization_id,contact_name,business_name,phone,email,source,stage,estimated_monthly_cents,next_action_at,owner_user_id,notes,lost_reason,converted_at,created_at,updated_at").order("updated_at", { ascending: false }).limit(300),
      admin.from("platform_crm_activities").select("id,lead_id,organization_id,kind,summary,created_by,created_at").order("created_at", { ascending: false }).limit(500),
    ]);
    for (const result of [leads, activities]) if (result.error) throw result.error;
    return { role: access.role, leads: leads.data ?? [], activities: activities.data ?? [] };
  }

  static async loadOrganization360(organizationId: string) {
    const access = await PlatformAdminService.access();
    const admin = createAdminClient();
    const [organization, stores, members, subscriptions, addons, invoices, incidents, founder, crm, plans, features] = await Promise.all([
      admin.from("organizations").select("id,name,legal_name,document,phone,email,status,timezone,currency,created_at,updated_at").eq("id", organizationId).single(),
      admin.from("stores").select("id,name,status,business_type,is_primary,module_preset,module_config_revision,created_at,updated_at").eq("organization_id", organizationId).order("is_primary", { ascending: false }),
      admin.from("organization_members").select("user_id,role_id,status,created_at,updated_at").eq("organization_id", organizationId).order("created_at"),
      admin.from("organization_subscriptions").select("id,plan_id,status,billing_interval,agreed_price_cents,price_locked,founder_slot,next_due_at,payment_status,metadata,updated_at").eq("organization_id", organizationId).order("updated_at", { ascending: false }),
      admin.from("subscription_addons").select("id,subscription_id,feature_id,feature_name_snapshot,unit_price_cents,quantity,status,starts_at,ends_at").eq("organization_id", organizationId).order("created_at", { ascending: false }),
      admin.from("subscription_invoices").select("id,reference_month,total_amount_cents,due_at,status,paid_at").eq("organization_id", organizationId).order("reference_month", { ascending: false }).limit(24),
      admin.from("platform_incidents").select("id,severity,status,title,summary,last_seen_at").eq("organization_id", organizationId).order("last_seen_at", { ascending: false }).limit(20),
      admin.from("founder_club_memberships").select("id,status,level_key,joined_at,terms_version,reward_unit").eq("organization_id", organizationId).maybeSingle(),
      admin.from("platform_crm_leads").select("id,stage,contact_name,business_name,next_action_at,updated_at").eq("organization_id", organizationId).maybeSingle(),
      admin.from("plans").select("id,key,name"),
      admin.from("features").select("id,key,name"),
    ]);
    for (const result of [organization, stores, members, subscriptions, addons, invoices, incidents, founder, crm, plans, features]) if (result.error) throw result.error;
    const usersResult = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (usersResult.error) throw usersResult.error;
    const userById = new Map(usersResult.data.users.map((user) => [user.id, user]));
    const planById = new Map((plans.data ?? []).map((plan) => [plan.id, plan]));
    const featureById = new Map((features.data ?? []).map((feature) => [feature.id, feature]));
    const subscriptionRows = (subscriptions.data ?? []).map((item) => ({ ...item, planName: planById.get(item.plan_id)?.name ?? "Plano indisponível", metadata: metadataObject(item.metadata) }));
    return {
      role: access.role, organization: organization.data, stores: stores.data ?? [],
      members: (members.data ?? []).map((item) => ({ ...item, email: userById.get(item.user_id)?.email ?? "Usuário indisponível" })),
      subscriptions: subscriptionRows,
      addons: (addons.data ?? []).map((item) => ({ ...item, featureName: item.feature_name_snapshot || featureById.get(item.feature_id)?.name || "Módulo" })),
      invoices: invoices.data ?? [], incidents: incidents.data ?? [], founder: founder.data ?? null, crm: crm.data ?? null,
    };
  }
}
