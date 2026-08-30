import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { PERMISSIONS } from "@/server/access/permissions";
import { NavigationAccessService } from "@/server/access/navigation-access-service";

export class CustomerSubscriptionAuthorizationError extends Error {
  constructor() {
    super("Subscription view permission required");
    this.name = "CustomerSubscriptionAuthorizationError";
  }
}

type JsonObject = Record<string, unknown>;

function objectMetadata(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function textMetadata(metadata: JsonObject, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export class CustomerSubscriptionService {
  static async load() {
    const loadedAt = new Date().toISOString();
    const access = await NavigationAccessService.load();
    if (!access.permissionKeys.includes(PERMISSIONS.SUBSCRIPTION_VIEW)) {
      throw new CustomerSubscriptionAuthorizationError();
    }

    const organizationId = access.context.organizationId;
    const admin = createAdminClient();
    const { data: organization, error: organizationError } = await admin
      .from("organizations")
      .select("id,name,email,status")
      .eq("id", organizationId)
      .single();
    if (organizationError) throw organizationError;

    const { data: subscription, error: subscriptionError } = await admin
      .from("organization_subscriptions")
      .select("id,organization_id,plan_id,plan_version_id,status,billing_interval,agreed_price_cents,price_currency,price_locked,price_lock_reason,billing_due_day,next_due_at,payment_status,founder_slot,grace_period_days,access_suspended_at,metadata,created_at,updated_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (subscriptionError) throw subscriptionError;

    if (!subscription) {
      return {
        loadedAt,
        organization,
        subscription: null,
        addons: [],
        invoices: [],
        payments: [],
        pixCharges: [],
      };
    }

    const [planResult, addonsResult, invoicesResult, paymentsResult, pixResult] = await Promise.all([
      admin.from("plans").select("id,key,name,description,monthly_price_cents,currency").eq("id", subscription.plan_id).single(),
      admin.from("subscription_addons").select("id,feature_name_snapshot,unit_price_cents,quantity,status,starts_at,ends_at").eq("subscription_id", subscription.id).order("created_at", { ascending: false }),
      admin.from("subscription_invoices").select("id,reference_month,base_amount_cents,discount_amount_cents,total_amount_cents,currency,due_at,status,paid_at,protocol,created_at").eq("subscription_id", subscription.id).order("reference_month", { ascending: false }).limit(24),
      admin.from("subscription_payments").select("id,invoice_id,amount_cents,currency,method,status,provider_key,paid_at,protocol,created_at").eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(50),
      admin.from("subscription_pix_charges").select("id,invoice_id,provider_key,amount_cents,currency,status,status_detail,qr_code,qr_code_base64,ticket_url,expires_at,paid_at,created_at").eq("subscription_id", subscription.id).order("created_at", { ascending: false }).limit(30),
    ]);

    for (const result of [planResult, addonsResult, invoicesResult, paymentsResult, pixResult]) {
      if (result.error) throw result.error;
    }

    const metadata = objectMetadata(subscription.metadata);
    const activeAddons = (addonsResult.data ?? []).filter((item) => item.status === "active");
    const addonTotalCents = activeAddons.reduce((sum, item) => sum + item.unit_price_cents * item.quantity, 0);
    const agreedPriceCents = subscription.agreed_price_cents ?? planResult.data.monthly_price_cents ?? 0;

    return {
      loadedAt,
      organization,
      subscription: {
        id: subscription.id,
        status: subscription.status,
        billingInterval: subscription.billing_interval,
        agreedPriceCents,
        addonTotalCents,
        totalMonthlyCents: agreedPriceCents + addonTotalCents,
        currency: subscription.price_currency,
        priceLocked: subscription.price_locked,
        priceLockReason: subscription.price_lock_reason,
        billingDueDay: subscription.billing_due_day,
        nextDueAt: subscription.next_due_at,
        paymentStatus: subscription.payment_status,
        founderSlot: subscription.founder_slot,
        gracePeriodDays: subscription.grace_period_days,
        accessSuspendedAt: subscription.access_suspended_at,
        contractPlanKey: planResult.data.key,
        contractPlanName: planResult.data.name,
        contractPlanDescription: planResult.data.description,
        functionalPlanKey: textMetadata(metadata, "functional_plan_key"),
        functionalPlanLabel: textMetadata(metadata, "functional_plan_label"),
      },
      addons: activeAddons,
      invoices: invoicesResult.data ?? [],
      payments: paymentsResult.data ?? [],
      pixCharges: pixResult.data ?? [],
    };
  }
}
