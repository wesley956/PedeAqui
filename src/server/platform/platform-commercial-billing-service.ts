import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { PlatformAdminService, PlatformAuthorizationError } from "@/server/platform/platform-admin-service";

const commonSchema = z.object({
  organizationId: z.string().uuid(),
  reason: z.string().trim().min(5).max(500),
  protocol: z.string().trim().min(3).max(120),
  idempotencyKey: z.string().trim().min(8).max(160),
});

const planSchema = commonSchema.extend({
  planId: z.string().uuid(),
  billingInterval: z.enum(["month", "year", "manual"]),
});

const trialSchema = planSchema.extend({ trialEndsAt: z.string().datetime() });
const graceSchema = commonSchema.extend({ graceEndsAt: z.string().datetime() });

const subscriptionLabels: Record<string, string> = {
  trialing: "Em período de teste",
  active: "Ativa",
  past_due: "Cobrança com atenção necessária",
  cancelled: "Cancelada",
  expired: "Encerrada",
};

const intervalLabels: Record<string, string> = { month: "Mensal", year: "Anual", manual: "Manual" };
const successfulBilling = new Set(["processed", "completed", "success", "succeeded"]);
const failedBilling = new Set(["failed", "error", "rejected"]);

function sanitizeError(value: string | null | undefined) {
  if (!value) return null;
  const compact = value.replace(/bearer\s+\S+/gi, "credencial protegida").replace(/[A-Za-z0-9_-]{32,}/g, "[protegido]").trim();
  return compact.slice(0, 240) || null;
}

async function requireSuperAdmin() {
  const access = await PlatformAdminService.access();
  if (access.role !== "super_admin") throw new PlatformAuthorizationError();
  return access;
}

async function resolvePlan(planId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.from("plans").select("id,key,name,active").eq("id", planId).single();
  if (error || !data || !data.active) throw new Error("Plano comercial indisponível.");
  return data;
}

async function currentSubscription(organizationId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("organization_subscriptions")
    .select("id,organization_id,plan_id,status,billing_interval,current_period_start,current_period_end,trial_ends_at,grace_ends_at,cancel_at_period_end,billing_provider_key,updated_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export class PlatformCommercialBillingService {
  static async load() {
    const base = await PlatformAdminService.load();
    const admin = createAdminClient();
    const [history, receipts] = await Promise.all([
      admin.from("subscription_history").select("id,organization_id,subscription_id,from_status,to_status,event_type,metadata,created_at").order("created_at", { ascending: false }).limit(300),
      admin.from("billing_webhook_receipts").select("id,provider_key,status,error_message,created_at,processed_at").order("created_at", { ascending: false }).limit(100),
    ]);
    if (history.error) throw history.error;
    if (receipts.error) throw receipts.error;

    const planById = new Map(base.plans.map((plan) => [plan.id, plan]));
    const orgById = new Map(base.organizations.map((org) => [org.id, org]));
    const featureById = new Map(base.features.map((feature) => [feature.id, feature]));

    const plans = base.plans.map((plan) => {
      const enabled = base.planFeatures.filter((item) => item.plan_id === plan.id && item.enabled);
      return {
        id: plan.id,
        name: plan.name,
        description: plan.description,
        active: plan.active,
        features: enabled.map((item) => ({
          name: featureById.get(item.feature_id)?.name ?? "Recurso",
          limitLabel: item.limit_value === null ? "Incluído" : `Até ${item.limit_value}`,
        })),
      };
    });

    const subscriptions = base.subscriptions.map((item) => ({
      id: item.id,
      organizationId: item.organization_id,
      organizationName: orgById.get(item.organization_id)?.name ?? "Empresa indisponível",
      planId: item.plan_id,
      planName: planById.get(item.plan_id)?.name ?? "Plano indisponível",
      status: item.status,
      statusLabel: subscriptionLabels[item.status] ?? "Em análise",
      billingInterval: item.billing_interval,
      intervalLabel: intervalLabels[item.billing_interval] ?? "Não informado",
      currentPeriodEnd: item.current_period_end,
      trialEndsAt: item.trial_ends_at,
      graceEndsAt: item.grace_ends_at,
      cancelAtPeriodEnd: item.cancel_at_period_end,
      hasProvider: Boolean(item.billing_provider_key),
      updatedAt: item.updated_at,
    }));

    const historyRows = (history.data ?? []).map((item) => {
      const metadata = item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata) ? item.metadata as Record<string, unknown> : {};
      return {
        id: item.id,
        organizationName: orgById.get(item.organization_id)?.name ?? "Empresa indisponível",
        fromLabel: item.from_status ? (subscriptionLabels[item.from_status] ?? "Situação anterior") : "Início",
        toLabel: subscriptionLabels[item.to_status] ?? "Atualização",
        reason: typeof metadata.reason === "string" ? metadata.reason.slice(0, 180) : "Alteração registrada pelo fluxo oficial",
        protocol: typeof metadata.protocol === "string" ? metadata.protocol.slice(0, 100) : null,
        createdAt: item.created_at,
      };
    });

    const billingEvents = (receipts.data ?? []).map((item) => ({
      id: item.id,
      provider: item.provider_key,
      status: failedBilling.has(item.status) ? "attention" : successfulBilling.has(item.status) ? "healthy" : "pending",
      statusLabel: failedBilling.has(item.status) ? "Falha de cobrança" : successfulBilling.has(item.status) ? "Processado" : "Em processamento",
      error: sanitizeError(item.error_message),
      createdAt: item.created_at,
      processedAt: item.processed_at,
    }));

    return {
      role: base.role,
      canManage: base.role === "super_admin",
      organizations: base.organizations.map((org) => ({ id: org.id, name: org.name, status: org.status })),
      plans,
      subscriptions,
      history: historyRows,
      billingEvents,
      metrics: {
        active: subscriptions.filter((item) => item.status === "active").length,
        trials: subscriptions.filter((item) => item.status === "trialing").length,
        attention: subscriptions.filter((item) => item.status === "past_due").length,
        scheduledCancellation: subscriptions.filter((item) => item.cancelAtPeriodEnd).length,
        billingFailures: billingEvents.filter((item) => item.status === "attention").length,
      },
    };
  }

  static async startOrExtendTrial(input: z.input<typeof trialSchema>) {
    const values = trialSchema.parse(input);
    await requireSuperAdmin();
    const [plan, current] = await Promise.all([resolvePlan(values.planId), currentSubscription(values.organizationId)]);
    if (current && current.status !== "trialing") throw new Error("Somente uma assinatura em teste pode ter o período de teste estendido.");
    return PlatformAdminService.applySubscription({
      organizationId: values.organizationId,
      planKey: plan.key,
      status: "trialing",
      billingInterval: values.billingInterval,
      periodEnd: current?.current_period_end ?? null,
      trialEndsAt: values.trialEndsAt,
      graceEndsAt: current?.grace_ends_at ?? null,
      cancelAtPeriodEnd: false,
      reason: values.reason,
      protocol: values.protocol,
      idempotencyKey: values.idempotencyKey,
    });
  }

  static async activateOrChangePlan(input: z.input<typeof planSchema>) {
    const values = planSchema.parse(input);
    await requireSuperAdmin();
    const [plan, current] = await Promise.all([resolvePlan(values.planId), currentSubscription(values.organizationId)]);
    if (current?.status === "cancelled" || current?.status === "expired") throw new Error("Assinatura encerrada exige novo ciclo comercial, não reativação silenciosa.");
    return PlatformAdminService.applySubscription({
      organizationId: values.organizationId,
      planKey: plan.key,
      status: "active",
      billingInterval: values.billingInterval,
      periodEnd: current?.current_period_end ?? null,
      trialEndsAt: current?.trial_ends_at ?? null,
      graceEndsAt: current?.grace_ends_at ?? null,
      cancelAtPeriodEnd: false,
      reason: values.reason,
      protocol: values.protocol,
      idempotencyKey: values.idempotencyKey,
    });
  }

  static async keepStatusAndChangePlan(input: z.input<typeof planSchema>) {
    const values = planSchema.parse(input);
    await requireSuperAdmin();
    const [plan, current] = await Promise.all([resolvePlan(values.planId), currentSubscription(values.organizationId)]);
    if (!current || !["trialing", "active", "past_due"].includes(current.status)) throw new Error("Não há assinatura vigente para trocar de plano.");
    return PlatformAdminService.applySubscription({
      organizationId: values.organizationId,
      planKey: plan.key,
      status: current.status as "trialing" | "active" | "past_due",
      billingInterval: values.billingInterval,
      periodEnd: current.current_period_end,
      trialEndsAt: current.trial_ends_at,
      graceEndsAt: current.grace_ends_at,
      cancelAtPeriodEnd: current.cancel_at_period_end,
      reason: values.reason,
      protocol: values.protocol,
      idempotencyKey: values.idempotencyKey,
    });
  }

  static async scheduleCancellation(input: z.input<typeof commonSchema>) {
    const values = commonSchema.parse(input);
    await requireSuperAdmin();
    const current = await currentSubscription(values.organizationId);
    if (!current || !["trialing", "active", "past_due"].includes(current.status)) throw new Error("Não há assinatura vigente para agendar cancelamento.");
    const plan = await resolvePlan(current.plan_id);
    return PlatformAdminService.applySubscription({
      organizationId: values.organizationId,
      planKey: plan.key,
      status: current.status as "trialing" | "active" | "past_due",
      billingInterval: current.billing_interval as "month" | "year" | "manual",
      periodEnd: current.current_period_end,
      trialEndsAt: current.trial_ends_at,
      graceEndsAt: current.grace_ends_at,
      cancelAtPeriodEnd: true,
      reason: values.reason,
      protocol: values.protocol,
      idempotencyKey: values.idempotencyKey,
    });
  }

  static async cancelNow(input: z.input<typeof commonSchema>) {
    const values = commonSchema.parse(input);
    await requireSuperAdmin();
    const current = await currentSubscription(values.organizationId);
    if (!current || !["trialing", "active", "past_due"].includes(current.status)) throw new Error("Não há assinatura vigente que possa ser cancelada.");
    const plan = await resolvePlan(current.plan_id);
    return PlatformAdminService.applySubscription({
      organizationId: values.organizationId,
      planKey: plan.key,
      status: "cancelled",
      billingInterval: current.billing_interval as "month" | "year" | "manual",
      periodEnd: current.current_period_end,
      trialEndsAt: current.trial_ends_at,
      graceEndsAt: current.grace_ends_at,
      cancelAtPeriodEnd: false,
      reason: values.reason,
      protocol: values.protocol,
      idempotencyKey: values.idempotencyKey,
    });
  }

  static async applyGracePeriod(input: z.input<typeof graceSchema>) {
    const values = graceSchema.parse(input);
    await requireSuperAdmin();
    const current = await currentSubscription(values.organizationId);
    if (!current || !["trialing", "active", "past_due"].includes(current.status)) throw new Error("Não há assinatura vigente para aplicar tolerância.");
    const plan = await resolvePlan(current.plan_id);
    return PlatformAdminService.applySubscription({
      organizationId: values.organizationId,
      planKey: plan.key,
      status: current.status as "trialing" | "active" | "past_due",
      billingInterval: current.billing_interval as "month" | "year" | "manual",
      periodEnd: current.current_period_end,
      trialEndsAt: current.trial_ends_at,
      graceEndsAt: values.graceEndsAt,
      cancelAtPeriodEnd: current.cancel_at_period_end,
      reason: values.reason,
      protocol: values.protocol,
      idempotencyKey: values.idempotencyKey,
    });
  }
}
