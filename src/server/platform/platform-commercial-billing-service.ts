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
const commercialTermsSchema = commonSchema.extend({
  agreedPriceCents: z.number().int().min(0).max(100_000_000),
  priceLocked: z.boolean(),
  priceLockReason: z.string().trim().max(500).nullable(),
  billingDueDay: z.number().int().min(1).max(28).nullable(),
  nextDueAt: z.string().datetime().nullable(),
  paymentStatus: z.enum(["not_started", "pending", "paid", "overdue", "waived"]),
}).superRefine((value, context) => {
  if (value.priceLocked && (!value.priceLockReason || value.priceLockReason.length < 5)) {
    context.addIssue({ code: "custom", path: ["priceLockReason"], message: "Informe o motivo do valor vitalício." });
  }
});

const planSaveSchema = z.object({
  planId: z.string().uuid().nullable(),
  key: z.string().trim().regex(/^[a-z0-9][a-z0-9._-]{1,79}$/),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).nullable(),
  monthlyPriceCents: z.number().int().min(0).max(100_000_000).nullable(),
  yearlyPriceCents: z.number().int().min(0).max(100_000_000).nullable(),
  active: z.boolean(),
  position: z.number().int().min(0).max(10_000),
  featureIds: z.array(z.string().uuid()).max(200),
  reason: z.string().trim().min(5).max(500),
  protocol: z.string().trim().min(3).max(120),
});

const adjustmentSchema = commonSchema.omit({ idempotencyKey: true }).extend({
  kind: z.enum(["discount_percent", "discount_amount", "credit"]),
  amountCents: z.number().int().min(1).max(100_000_000).nullable(),
  percentage: z.number().positive().max(100).nullable(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
}).superRefine((value, context) => {
  if (new Date(value.endsAt) <= new Date(value.startsAt)) context.addIssue({ code: "custom", path: ["endsAt"], message: "O desconto precisa ter uma data final posterior ao início." });
  if (value.kind === "discount_percent" && value.percentage === null) context.addIssue({ code: "custom", path: ["percentage"], message: "Informe o percentual." });
  if (value.kind !== "discount_percent" && value.amountCents === null) context.addIssue({ code: "custom", path: ["amountCents"], message: "Informe o valor." });
});

const adjustmentCancelSchema = z.object({
  adjustmentId: z.string().uuid(), reason: z.string().trim().min(5).max(500), protocol: z.string().trim().min(3).max(120),
});

const invoiceSchema = commonSchema.extend({
  referenceMonth: z.string().date(),
  baseAmountCents: z.number().int().min(0).max(100_000_000),
  discountAmountCents: z.number().int().min(0).max(100_000_000),
  dueAt: z.string().datetime(),
  status: z.enum(["pending", "paid", "overdue", "cancelled", "waived"]),
});

const paymentSchema = z.object({
  invoiceId: z.string().uuid(), amountCents: z.number().int().min(1).max(100_000_000),
  method: z.enum(["manual", "pix", "boleto", "card"]), status: z.enum(["pending", "paid", "failed", "refunded", "cancelled"]),
  reason: z.string().trim().min(5).max(500), protocol: z.string().trim().min(3).max(120), idempotencyKey: z.string().trim().min(8).max(160),
});

const accessSchema = commonSchema.omit({ idempotencyKey: true }).extend({ suspended: z.boolean() });
const founderSchema = commonSchema.omit({ idempotencyKey: true });

const changeQuoteSchema = commonSchema.omit({ idempotencyKey: true }).extend({
  changeType: z.enum(["add_on", "remove_addon", "upgrade", "downgrade"]),
  targetPlanId: z.string().uuid().nullable(),
  featureId: z.string().uuid().nullable(),
  featurePriceCents: z.number().int().min(1).max(100_000_000).nullable(),
  effectiveAt: z.string().datetime(),
}).superRefine((value, context) => {
  if (["upgrade", "downgrade"].includes(value.changeType) && value.targetPlanId === null) {
    context.addIssue({ code: "custom", path: ["targetPlanId"], message: "Selecione o plano de destino." });
  }
  if (["add_on", "remove_addon"].includes(value.changeType) && value.featureId === null) {
    context.addIssue({ code: "custom", path: ["featureId"], message: "Selecione o módulo." });
  }
  if (value.changeType === "add_on" && value.featurePriceCents === null) {
    context.addIssue({ code: "custom", path: ["featurePriceCents"], message: "Informe o valor do módulo adicional." });
  }
});

const changeDecisionSchema = z.object({
  changeId: z.string().uuid(),
  reason: z.string().trim().min(5).max(500),
  protocol: z.string().trim().min(3).max(120),
});

const subscriptionLabels: Record<string, string> = {
  trialing: "Em período de teste",
  active: "Ativa",
  past_due: "Cobrança com atenção necessária",
  cancelled: "Cancelada",
  expired: "Encerrada",
};

const intervalLabels: Record<string, string> = { month: "Mensal", year: "Anual", manual: "Manual" };
const paymentLabels: Record<string, string> = { not_started: "Cobrança ainda não iniciada", pending: "Pagamento pendente", paid: "Pago", overdue: "Em atraso", waived: "Isento neste vencimento" };
const invoiceLabels: Record<string, string> = { pending: "Pendente", paid: "Paga", overdue: "Em atraso", cancelled: "Cancelada", waived: "Isenta" };
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
    const base = await PlatformAdminService.loadCommercial();
    const admin = createAdminClient();
    const [history, receipts, versions, adjustments, invoices, payments, notifications, financialAudit, addons, changeRequests] = await Promise.all([
      admin.from("subscription_history").select("id,organization_id,subscription_id,from_status,to_status,event_type,metadata,created_at").order("created_at", { ascending: false }).limit(300),
      admin.from("billing_webhook_receipts").select("id,provider_key,status,error_message,created_at,processed_at").order("created_at", { ascending: false }).limit(100),
      admin.from("plan_versions").select("id,plan_id,version,monthly_price_cents,yearly_price_cents,effective_at,reason,protocol").order("created_at", { ascending: false }).limit(300),
      admin.from("subscription_billing_adjustments").select("id,organization_id,subscription_id,kind,amount_cents,percentage,starts_at,ends_at,cancelled_at,reason,protocol,created_at").order("created_at", { ascending: false }).limit(300),
      admin.from("subscription_invoices").select("id,organization_id,subscription_id,plan_version_id,reference_month,base_amount_cents,discount_amount_cents,total_amount_cents,due_at,status,paid_at,cancelled_at,reason,protocol,created_at,updated_at").order("reference_month", { ascending: false }).limit(500),
      admin.from("subscription_payments").select("id,organization_id,invoice_id,amount_cents,method,status,paid_at,reason,protocol,created_at").order("created_at", { ascending: false }).limit(500),
      admin.from("subscription_billing_notifications").select("id,organization_id,subscription_id,invoice_id,channel,kind,status,scheduled_at,sent_at,last_error,created_at").order("created_at", { ascending: false }).limit(300),
      admin.from("platform_financial_audit").select("id,organization_id,action,entity_type,entity_id,reason,protocol,created_at").order("created_at", { ascending: false }).limit(300),
      admin.from("subscription_addons").select("id,organization_id,subscription_id,feature_id,feature_name_snapshot,unit_price_cents,quantity,status,starts_at,ends_at,accepted_at,accepted_by,reason,protocol,created_at").order("created_at", { ascending: false }).limit(500),
      admin.from("subscription_change_requests").select("id,organization_id,subscription_id,change_type,status,current_plan_id,target_plan_id,feature_id,feature_name_snapshot,current_base_price_cents,current_addons_price_cents,proposed_base_price_cents,proposed_addons_price_cents,proposed_total_price_cents,effective_at,accepted_at,accepted_by,applied_at,cancelled_at,reason,protocol,created_at").order("created_at", { ascending: false }).limit(500),
    ]);
    for (const result of [history, receipts, versions, adjustments, invoices, payments, notifications, financialAudit, addons, changeRequests]) if (result.error) throw result.error;

    const planById = new Map(base.plans.map((plan) => [plan.id, plan]));
    const orgById = new Map(base.organizations.map((org) => [org.id, org]));
    const featureById = new Map(base.features.map((feature) => [feature.id, feature]));

    const plans = base.plans.map((plan) => {
      const enabled = base.planFeatures.filter((item) => item.plan_id === plan.id && item.enabled);
      return {
        id: plan.id,
        key: plan.key,
        name: plan.name,
        description: plan.description,
        active: plan.active,
        monthlyPriceCents: plan.monthly_price_cents,
        yearlyPriceCents: plan.yearly_price_cents,
        currency: plan.currency,
        position: plan.position,
        currentVersionId: plan.current_version_id,
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
      agreedPriceCents: item.agreed_price_cents,
      priceCurrency: item.price_currency,
      priceLocked: item.price_locked,
      priceLockedAt: item.price_locked_at,
      priceLockReason: item.price_lock_reason,
      billingDueDay: item.billing_due_day,
      nextDueAt: item.next_due_at,
      paymentStatus: item.payment_status,
      paymentStatusLabel: paymentLabels[item.payment_status] ?? "Não informado",
      planVersionId: item.plan_version_id,
      founderSlot: item.founder_slot,
      gracePeriodDays: item.grace_period_days,
      accessSuspendedAt: item.access_suspended_at,
      accessSuspensionReason: item.access_suspension_reason,
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

    const invoiceRows = (invoices.data ?? []).map((item) => ({
      id: item.id,
      organizationId: item.organization_id,
      organizationName: orgById.get(item.organization_id)?.name ?? "Empresa indisponível",
      referenceMonth: item.reference_month,
      baseAmountCents: item.base_amount_cents,
      discountAmountCents: item.discount_amount_cents,
      totalAmountCents: item.total_amount_cents,
      dueAt: item.due_at,
      status: item.status,
      statusLabel: invoiceLabels[item.status] ?? "Em análise",
      paidAt: item.paid_at,
      protocol: item.protocol,
      updatedAt: item.updated_at,
    }));
    const paymentRows = (payments.data ?? []).map((item) => ({
      id: item.id, invoiceId: item.invoice_id, organizationId: item.organization_id,
      organizationName: orgById.get(item.organization_id)?.name ?? "Empresa indisponível",
      amountCents: item.amount_cents, method: item.method, status: item.status, paidAt: item.paid_at,
      protocol: item.protocol, createdAt: item.created_at,
    }));
    const adjustmentRows = (adjustments.data ?? []).map((item) => ({
      id: item.id, organizationId: item.organization_id,
      organizationName: orgById.get(item.organization_id)?.name ?? "Empresa indisponível",
      kind: item.kind, amountCents: item.amount_cents, percentage: item.percentage === null ? null : Number(item.percentage),
      startsAt: item.starts_at, endsAt: item.ends_at, cancelledAt: item.cancelled_at,
      reason: item.reason, protocol: item.protocol,
    }));
    const addonRows = (addons.data ?? []).map((item) => ({
      id: item.id, organizationId: item.organization_id,
      organizationName: orgById.get(item.organization_id)?.name ?? "Empresa indisponível",
      subscriptionId: item.subscription_id, featureId: item.feature_id, featureName: item.feature_name_snapshot,
      unitPriceCents: item.unit_price_cents, quantity: item.quantity, status: item.status,
      startsAt: item.starts_at, endsAt: item.ends_at, acceptedAt: item.accepted_at,
      reason: item.reason, protocol: item.protocol, createdAt: item.created_at,
    }));
    const addonsBySubscription: Record<string, typeof addonRows> = {};
    for (const addon of addonRows) {
      (addonsBySubscription[addon.subscriptionId] ??= []).push(addon);
    }
    const changeRows = (changeRequests.data ?? []).map((item) => ({
      id: item.id, organizationId: item.organization_id,
      organizationName: orgById.get(item.organization_id)?.name ?? "Empresa indisponível",
      subscriptionId: item.subscription_id, changeType: item.change_type, status: item.status,
      currentPlanName: planById.get(item.current_plan_id)?.name ?? "Plano anterior",
      targetPlanName: item.target_plan_id ? (planById.get(item.target_plan_id)?.name ?? "Plano de destino") : null,
      featureId: item.feature_id, featureName: item.feature_name_snapshot,
      currentBasePriceCents: item.current_base_price_cents, currentAddonsPriceCents: item.current_addons_price_cents,
      proposedBasePriceCents: item.proposed_base_price_cents, proposedAddonsPriceCents: item.proposed_addons_price_cents,
      proposedTotalPriceCents: item.proposed_total_price_cents, effectiveAt: item.effective_at,
      isDue: new Date(item.effective_at).getTime() <= Date.now(),
      acceptedAt: item.accepted_at, appliedAt: item.applied_at, cancelledAt: item.cancelled_at,
      reason: item.reason, protocol: item.protocol, createdAt: item.created_at,
    }));
    const projectedBaseRevenueCents = subscriptions.filter((item) => item.status === "active").reduce((total, item) => {
      if (item.agreedPriceCents !== null) return total + item.agreedPriceCents;
      return total + (planById.get(item.planId)?.monthly_price_cents ?? 0);
    }, 0);
    const projectedAddonRevenueCents = addonRows.filter((item) => item.status === "active").reduce((total, item) => total + item.unitPriceCents * item.quantity, 0);
    const projectedRevenueCents = projectedBaseRevenueCents + projectedAddonRevenueCents;
    const planRevenue = new Map<string, { subscriptions: number; amountCents: number }>();
    for (const subscription of subscriptions) {
      if (subscription.status !== "active") continue;
      const plan = planById.get(subscription.planId);
      const current = planRevenue.get(subscription.planId) ?? { subscriptions: 0, amountCents: 0 };
      current.subscriptions += 1;
      current.amountCents += subscription.agreedPriceCents ?? plan?.monthly_price_cents ?? 0;
      planRevenue.set(subscription.planId, current);
    }
    const revenueByPlan = plans.flatMap((plan) => {
      const revenue = planRevenue.get(plan.id);
      return revenue ? [{ id: plan.id, name: plan.name, ...revenue }] : [];
    });
    const moduleRevenue = new Map<string, { id: string; name: string; subscriptions: number; amountCents: number }>();
    for (const addon of addonRows) {
      if (addon.status !== "active") continue;
      const current = moduleRevenue.get(addon.featureId) ?? { id: addon.featureId, name: addon.featureName, subscriptions: 0, amountCents: 0 };
      current.subscriptions += 1;
      current.amountCents += addon.unitPriceCents * addon.quantity;
      moduleRevenue.set(addon.featureId, current);
    }
    const revenueByModule = [...moduleRevenue.values()];
    const overdueAmountCents = invoiceRows.filter((item) => item.status === "overdue").reduce((total, item) => total + item.totalAmountCents, 0);
    const now = Date.now();
    const dueSoon = invoiceRows.filter((item) => item.status === "pending" && new Date(item.dueAt).getTime() >= now && new Date(item.dueAt).getTime() <= now + 7 * 86_400_000).length;

    return {
      role: base.role,
      canManage: base.role === "super_admin",
      organizations: base.organizations.map((org) => ({ id: org.id, name: org.name, status: org.status })),
      features: base.features.map((feature) => ({ id: feature.id, name: feature.name, active: feature.active })),
      planFeatures: base.planFeatures,
      plans,
      subscriptions,
      history: historyRows,
      billingEvents,
      planVersions: versions.data ?? [],
      adjustments: adjustmentRows,
      invoices: invoiceRows,
      payments: paymentRows,
      notifications: notifications.data ?? [],
      financialAudit: financialAudit.data ?? [],
      addons: addonRows,
      addonsBySubscription,
      changeRequests: changeRows,
      revenueByPlan,
      revenueByModule,
      metrics: {
        active: subscriptions.filter((item) => item.status === "active").length,
        trials: subscriptions.filter((item) => item.status === "trialing").length,
        attention: subscriptions.filter((item) => item.status === "past_due").length,
        scheduledCancellation: subscriptions.filter((item) => item.cancelAtPeriodEnd).length,
        billingFailures: billingEvents.filter((item) => item.status === "attention").length,
        projectedRevenueCents,
        projectedBaseRevenueCents,
        projectedAddonRevenueCents,
        overdueAmountCents,
        dueSoon,
        founderSlotsUsed: subscriptions.filter((item) => item.founderSlot !== null).length,
      },
    };
  }

  static async createChangeQuote(input: z.input<typeof changeQuoteSchema>) {
    const values = changeQuoteSchema.parse(input);
    const access = await requireSuperAdmin();
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("subscription_change_quote_internal", {
      p_organization_id: values.organizationId, p_change_type: values.changeType,
      p_target_plan_id: values.targetPlanId, p_feature_id: values.featureId,
      p_feature_price_cents: values.featurePriceCents, p_effective_at: values.effectiveAt,
      p_actor_user_id: access.user.id, p_reason: values.reason, p_protocol: values.protocol,
    });
    if (error) throw error;
    return data;
  }

  static async acceptChange(input: z.input<typeof changeDecisionSchema>) {
    const values = changeDecisionSchema.parse(input);
    const access = await requireSuperAdmin();
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("subscription_change_accept_internal", {
      p_change_id: values.changeId, p_actor_user_id: access.user.id, p_reason: values.reason, p_protocol: values.protocol,
    });
    if (error) throw error;
    return data;
  }

  static async applyScheduledChange(input: z.input<typeof changeDecisionSchema>) {
    const values = changeDecisionSchema.parse(input);
    const access = await requireSuperAdmin();
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("subscription_change_apply_internal", {
      p_change_id: values.changeId, p_actor_user_id: access.user.id, p_reason: values.reason, p_protocol: values.protocol,
    });
    if (error) throw error;
    return data;
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

  static async updateCommercialTerms(input: z.input<typeof commercialTermsSchema>) {
    const values = commercialTermsSchema.parse(input);
    const access = await requireSuperAdmin();
    const current = await currentSubscription(values.organizationId);
    if (!current) throw new Error("Crie ou ative a assinatura antes de definir os termos comerciais.");
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("subscription_terms_update_internal", {
      p_organization_id: values.organizationId,
      p_agreed_price_cents: values.agreedPriceCents,
      p_price_locked: values.priceLocked,
      p_price_lock_reason: values.priceLockReason,
      p_billing_due_day: values.billingDueDay,
      p_next_due_at: values.nextDueAt,
      p_payment_status: values.paymentStatus,
      p_reason: values.reason,
      p_protocol: values.protocol,
      p_idempotency_key: values.idempotencyKey,
      p_actor_user_id: access.user.id,
    });
    if (error) throw error;
    return data;
  }

  static async savePlan(input: z.input<typeof planSaveSchema>) {
    const values = planSaveSchema.parse(input);
    const access = await requireSuperAdmin();
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("platform_plan_save_internal", {
      p_plan_id: values.planId,
      p_key: values.key,
      p_name: values.name,
      p_description: values.description,
      p_monthly_price_cents: values.monthlyPriceCents,
      p_yearly_price_cents: values.yearlyPriceCents,
      p_active: values.active,
      p_position: values.position,
      p_feature_ids: values.featureIds,
      p_actor_user_id: access.user.id,
      p_reason: values.reason,
      p_protocol: values.protocol,
    });
    if (error) throw error;
    return data;
  }

  static async applyAdjustment(input: z.input<typeof adjustmentSchema>) {
    const values = adjustmentSchema.parse(input);
    const access = await requireSuperAdmin();
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("subscription_adjustment_apply_internal", {
      p_organization_id: values.organizationId,
      p_kind: values.kind,
      p_amount_cents: values.kind === "discount_percent" ? null : values.amountCents,
      p_percentage: values.kind === "discount_percent" ? values.percentage : null,
      p_starts_at: values.startsAt,
      p_ends_at: values.endsAt,
      p_actor_user_id: access.user.id,
      p_reason: values.reason,
      p_protocol: values.protocol,
    });
    if (error) throw error;
    return data;
  }

  static async cancelAdjustment(input: z.input<typeof adjustmentCancelSchema>) {
    const values = adjustmentCancelSchema.parse(input);
    const access = await requireSuperAdmin();
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("subscription_adjustment_cancel_internal", {
      p_adjustment_id: values.adjustmentId, p_actor_user_id: access.user.id, p_reason: values.reason, p_protocol: values.protocol,
    });
    if (error) throw error;
    return data;
  }

  static async saveInvoice(input: z.input<typeof invoiceSchema>) {
    const values = invoiceSchema.parse(input);
    const access = await requireSuperAdmin();
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("subscription_invoice_save_internal", {
      p_organization_id: values.organizationId,
      p_reference_month: values.referenceMonth,
      p_base_amount_cents: values.baseAmountCents,
      p_discount_amount_cents: values.discountAmountCents,
      p_due_at: values.dueAt,
      p_status: values.status,
      p_actor_user_id: access.user.id,
      p_reason: values.reason,
      p_protocol: values.protocol,
      p_idempotency_key: values.idempotencyKey,
    });
    if (error) throw error;
    return data;
  }

  static async recordPayment(input: z.input<typeof paymentSchema>) {
    const values = paymentSchema.parse(input);
    const access = await requireSuperAdmin();
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("subscription_payment_record_internal", {
      p_invoice_id: values.invoiceId, p_amount_cents: values.amountCents, p_method: values.method, p_status: values.status,
      p_actor_user_id: access.user.id, p_reason: values.reason, p_protocol: values.protocol, p_idempotency_key: values.idempotencyKey,
    });
    if (error) throw error;
    return data;
  }

  static async setAccess(input: z.input<typeof accessSchema>) {
    const values = accessSchema.parse(input);
    const access = await requireSuperAdmin();
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("subscription_access_set_internal", {
      p_organization_id: values.organizationId, p_suspended: values.suspended, p_actor_user_id: access.user.id,
      p_reason: values.reason, p_protocol: values.protocol,
    });
    if (error) throw error;
    return data;
  }

  static async assignFounder(input: z.input<typeof founderSchema>) {
    const values = founderSchema.parse(input);
    const access = await requireSuperAdmin();
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("subscription_founder_assign_internal", {
      p_organization_id: values.organizationId, p_actor_user_id: access.user.id, p_reason: values.reason, p_protocol: values.protocol,
    });
    if (error) throw error;
    return data;
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
