import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { MercadoPagoOrderProvider } from "@/server/payments/providers/mercado-pago-order-provider";
import { PlatformBillingSourceService } from "@/server/billing/platform-billing-source-service";

const PIX_PROVIDER_KEY = "mercado_pago" as const;
const RENEWAL_HORIZON_DAYS = 3;
const PIX_EXPIRATION = "P7D";

function env(name: string) {
  return process.env[name]?.trim() || null;
}

function mapProviderStatus(status: "pending" | "paid" | "expired" | "canceled" | "failed") {
  return status === "canceled" ? "cancelled" : status;
}

function referenceMonth(value: string) {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  if (!year || !month) throw new Error("Unable to resolve billing reference month");
  return `${year}-${month}-01`;
}

async function systemActor() {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("platform_admins")
    .select("user_id")
    .eq("active", true)
    .eq("role", "super_admin")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.user_id) throw new Error("No active platform super_admin available for billing audit");
  return data.user_id;
}

export class SubscriptionPixBillingService {
  static async configuration() {
    const source = await PlatformBillingSourceService.configuration();
    return {
      provider: PIX_PROVIDER_KEY,
      billingEnabled: source.enabled,
      sourceConfigured: source.configured,
      sourceOwnerEmail: source.sourceOwnerEmail,
      providerAccountId: source.providerAccountId,
      providerHealthStatus: source.healthStatus,
      accessTokenConfigured: source.credentialsReady,
      webhookSecretConfigured: source.credentialsReady,
      cronSecretConfigured: Boolean(env("CRON_SECRET")),
    };
  }

  static async webhookSecret() {
    return PlatformBillingSourceService.webhookSecret();
  }

  static async runRenewals(now = new Date()) {
    const source = await PlatformBillingSourceService.configuration();
    const result = { scanned: 0, invoices: 0, pixCreated: 0, reconciled: 0, skipped: 0, disabled: !source.enabled, errors: [] as string[] };
    if (!source.enabled) return result;

    const admin = createAdminClient();
    const actorUserId = await systemActor();
    const horizon = new Date(now.getTime() + RENEWAL_HORIZON_DAYS * 86_400_000).toISOString();

    const { data: subscriptions, error } = await admin
      .from("organization_subscriptions")
      .select("id,organization_id,plan_version_id,status,billing_interval,agreed_price_cents,next_due_at,payment_status,access_suspended_at")
      .in("status", ["active", "past_due"])
      .in("billing_interval", ["month", "year"])
      .not("agreed_price_cents", "is", null)
      .not("next_due_at", "is", null)
      .lte("next_due_at", horizon)
      .order("next_due_at", { ascending: true })
      .limit(200);
    if (error) throw error;
    result.scanned = subscriptions?.length ?? 0;

    for (const subscription of subscriptions ?? []) {
      try {
        const dueAt = subscription.next_due_at;
        if (!dueAt || subscription.agreed_price_cents === null) {
          result.skipped += 1;
          continue;
        }

        const [{ data: addons, error: addonsError }, { data: organization, error: organizationError }] = await Promise.all([
          admin.from("subscription_addons").select("unit_price_cents,quantity,status").eq("subscription_id", subscription.id).eq("status", "active"),
          admin.from("organizations").select("email").eq("id", subscription.organization_id).single(),
        ]);
        if (addonsError) throw addonsError;
        if (organizationError) throw organizationError;

        const addonCents = (addons ?? []).reduce((sum, item) => sum + item.unit_price_cents * item.quantity, 0);
        const amountCents = subscription.agreed_price_cents + addonCents;
        if (amountCents < 1) {
          result.skipped += 1;
          continue;
        }

        const month = referenceMonth(dueAt);
        const invoiceIdempotency = `auto-invoice:${subscription.id}:${month}`;
        const invoiceStatus = new Date(dueAt).getTime() < now.getTime() ? "overdue" : "pending";
        const { error: invoiceRpcError } = await admin.rpc("subscription_invoice_save_internal", {
          p_organization_id: subscription.organization_id,
          p_reference_month: month,
          p_base_amount_cents: amountCents,
          p_discount_amount_cents: 0,
          p_due_at: dueAt,
          p_status: invoiceStatus,
          p_actor_user_id: actorUserId,
          p_reason: "Mensalidade automática do PedeAqui",
          p_protocol: `AUTO-${month.slice(0, 7)}-${subscription.id.slice(0, 8)}`,
          p_idempotency_key: invoiceIdempotency,
        });
        if (invoiceRpcError) throw invoiceRpcError;

        const { data: invoice, error: invoiceError } = await admin
          .from("subscription_invoices")
          .select("id,status")
          .eq("organization_id", subscription.organization_id)
          .eq("reference_month", month)
          .single();
        if (invoiceError) throw invoiceError;
        result.invoices += 1;

        const { data: currentCharge, error: currentChargeError } = await admin
          .from("subscription_pix_charges")
          .select("id,provider_order_id,status,expires_at")
          .eq("invoice_id", invoice.id)
          .in("status", ["pending", "paid"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (currentChargeError) throw currentChargeError;

        if (currentCharge?.status === "paid") {
          result.skipped += 1;
          continue;
        }
        if (currentCharge?.status === "pending" && currentCharge.provider_order_id) {
          const reconciliation = await this.reconcileCharge(currentCharge.id, actorUserId);
          if (reconciliation.status === "paid") result.reconciled += 1;
          else result.skipped += 1;
          continue;
        }

        if (!organization.email?.trim()) {
          result.skipped += 1;
          continue;
        }

        await this.createCharge({
          organizationId: subscription.organization_id,
          subscriptionId: subscription.id,
          invoiceId: invoice.id,
          amountCents,
          payerEmail: organization.email.trim(),
          actorUserId,
        });
        result.pixCreated += 1;
      } catch (error) {
        result.errors.push(error instanceof Error ? error.message.slice(0, 180) : "Unknown renewal error");
      }
    }

    return result;
  }

  static async createCharge(input: {
    organizationId: string;
    subscriptionId: string;
    invoiceId: string;
    amountCents: number;
    payerEmail: string;
    actorUserId?: string;
  }) {
    const credentials = await PlatformBillingSourceService.credentials();
    const admin = createAdminClient();

    const { count, error: countError } = await admin
      .from("subscription_pix_charges")
      .select("id", { count: "exact", head: true })
      .eq("invoice_id", input.invoiceId);
    if (countError) throw countError;
    const attempt = (count ?? 0) + 1;
    const idempotencyKey = `pa-sub-pix:${input.invoiceId}:${attempt}`;
    const externalReference = `PA_${input.invoiceId.replace(/-/g, "_")}_${attempt}`.slice(0, 64);

    const provider = new MercadoPagoOrderProvider(credentials.access_token);
    const order = await provider.createPixCharge({
      amountCents: input.amountCents,
      currency: "BRL",
      externalReference,
      idempotencyKey,
      payerEmail: input.payerEmail,
      expirationTime: PIX_EXPIRATION,
    });

    if (order.amountCents !== input.amountCents || order.externalReference !== externalReference) {
      throw new Error("Mercado Pago returned a PIX charge that does not match the requested invoice");
    }

    const providerStatus = mapProviderStatus(order.status);
    const initialStatus = providerStatus === "paid" ? "pending" : providerStatus;
    const { data, error } = await admin
      .from("subscription_pix_charges")
      .insert({
        organization_id: input.organizationId,
        subscription_id: input.subscriptionId,
        invoice_id: input.invoiceId,
        provider_key: PIX_PROVIDER_KEY,
        provider_order_id: order.providerOrderId,
        provider_payment_id: order.providerPaymentId,
        external_reference: externalReference,
        idempotency_key: idempotencyKey,
        amount_cents: order.amountCents,
        currency: order.currency,
        status: initialStatus,
        status_detail: order.statusDetail,
        qr_code: order.qrCode,
        qr_code_base64: order.qrCodeBase64,
        ticket_url: order.ticketUrl,
        expires_at: order.expiresAt,
        paid_at: null,
        metadata: { source: "subscription_renewal", attempt, provider_account_id: credentials.provider_account_id },
      })
      .select("id,provider_order_id,status")
      .single();
    if (error) throw error;

    if (providerStatus === "paid") {
      await this.confirmPaidCharge(data.id, order, input.actorUserId ?? await systemActor());
    }
    return data;
  }

  static async reconcileByProviderResource(resourceId: string) {
    const admin = createAdminClient();
    const actorUserId = await systemActor();
    const { data: charge, error } = await admin
      .from("subscription_pix_charges")
      .select("id")
      .or(`provider_order_id.eq.${resourceId},provider_payment_id.eq.${resourceId}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!charge) return { matched: false as const, status: "ignored" as const };
    const reconciled = await this.reconcileCharge(charge.id, actorUserId);
    return { matched: true as const, ...reconciled };
  }

  static async reconcileCharge(chargeId: string, actorUserId?: string) {
    const credentials = await PlatformBillingSourceService.credentials({ requireBillingEnabled: false });
    const admin = createAdminClient();
    const actor = actorUserId ?? await systemActor();
    const { data: charge, error: chargeError } = await admin
      .from("subscription_pix_charges")
      .select("id,provider_order_id,amount_cents,status")
      .eq("id", chargeId)
      .single();
    if (chargeError) throw chargeError;
    if (!charge.provider_order_id) throw new Error("PIX charge has no provider order id");
    if (charge.status === "paid") return { status: "paid" as const, paymentRecorded: false, idempotent: true };

    const provider = new MercadoPagoOrderProvider(credentials.access_token);
    const order = await provider.getOrder(charge.provider_order_id);
    if (order.amountCents !== charge.amount_cents) throw new Error("PIX reconciliation amount mismatch");
    const status = mapProviderStatus(order.status);

    if (status === "paid") {
      const confirmation = await this.confirmPaidCharge(charge.id, order, actor);
      return { status: "paid" as const, paymentRecorded: !confirmation.idempotent, idempotent: confirmation.idempotent };
    }

    const { error: updateError } = await admin
      .from("subscription_pix_charges")
      .update({
        provider_payment_id: order.providerPaymentId,
        status,
        status_detail: order.statusDetail,
        qr_code: order.qrCode,
        qr_code_base64: order.qrCodeBase64,
        ticket_url: order.ticketUrl,
        expires_at: order.expiresAt,
        paid_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", charge.id);
    if (updateError) throw updateError;
    return { status, paymentRecorded: false, idempotent: false };
  }

  private static async confirmPaidCharge(
    chargeId: string,
    order: { providerOrderId: string; providerPaymentId: string | null; statusDetail: string | null },
    actorUserId: string,
  ) {
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("subscription_pix_charge_confirm_internal", {
      p_charge_id: chargeId,
      p_provider_order_id: order.providerOrderId,
      p_provider_payment_id: order.providerPaymentId,
      p_status_detail: order.statusDetail,
      p_paid_at: new Date().toISOString(),
      p_actor_user_id: actorUserId,
    });
    if (error) throw error;
    const result = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : {};
    return { idempotent: result.idempotent === true, nextDueAt: typeof result.next_due_at === "string" ? result.next_due_at : null };
  }
}
