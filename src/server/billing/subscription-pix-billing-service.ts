import "server-only";

import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { MercadoPagoOrderProvider } from "@/server/payments/providers/mercado-pago-order-provider";

const PIX_PROVIDER_KEY = "mercado_pago" as const;
const RENEWAL_HORIZON_DAYS = 3;
const PIX_EXPIRATION = "P7D";

function env(name: string) {
  return process.env[name]?.trim() || null;
}

function platformAccessToken() {
  return env("PEDEAQUI_BILLING_MERCADO_PAGO_ACCESS_TOKEN");
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

function addInterval(value: string, billingInterval: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid next due date");
  if (billingInterval === "year") date.setUTCFullYear(date.getUTCFullYear() + 1);
  else date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString();
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
  static configuration() {
    return {
      provider: PIX_PROVIDER_KEY,
      accessTokenConfigured: Boolean(platformAccessToken()),
      webhookSecretConfigured: Boolean(env("PEDEAQUI_BILLING_MERCADO_PAGO_WEBHOOK_SECRET")),
      cronSecretConfigured: Boolean(env("CRON_SECRET")),
    };
  }

  static webhookSecret() {
    return env("PEDEAQUI_BILLING_MERCADO_PAGO_WEBHOOK_SECRET");
  }

  static cronAuthorized(authorizationHeader: string | null) {
    const secret = env("CRON_SECRET");
    if (!secret) return false;
    return authorizationHeader === `Bearer ${secret}`;
  }

  static async runRenewals(now = new Date()) {
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

    const result = { scanned: subscriptions?.length ?? 0, invoices: 0, pixCreated: 0, reconciled: 0, skipped: 0, errors: [] as string[] };

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
        const { data: invoice, error: invoiceError } = await admin.rpc("subscription_invoice_save_internal", {
          p_organization_id: subscription.organization_id,
          p_reference_month: month,
          p_base_amount_cents: amountCents,
          p_discount_amount_cents: 0,
          p_due_at: dueAt,
          p_status: "pending",
          p_actor_user_id: actorUserId,
          p_reason: "Mensalidade automática do PedeAqui",
          p_protocol: `AUTO-${month.slice(0, 7)}-${subscription.id.slice(0, 8)}`,
          p_idempotency_key: invoiceIdempotency,
        });
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

        if (!organization.email?.trim() || !platformAccessToken()) {
          result.skipped += 1;
          continue;
        }

        await this.createCharge({
          organizationId: subscription.organization_id,
          subscriptionId: subscription.id,
          invoiceId: invoice.id,
          amountCents,
          payerEmail: organization.email.trim(),
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
  }) {
    const token = platformAccessToken();
    if (!token) throw new Error("PedeAqui billing Mercado Pago access token is not configured");
    const admin = createAdminClient();

    const { count, error: countError } = await admin
      .from("subscription_pix_charges")
      .select("id", { count: "exact", head: true })
      .eq("invoice_id", input.invoiceId);
    if (countError) throw countError;
    const attempt = (count ?? 0) + 1;
    const idempotencyKey = `pa-sub-pix:${input.invoiceId}:${attempt}`;
    const externalReference = `PA_${input.invoiceId.replace(/-/g, "_")}_${attempt}`.slice(0, 64);

    const provider = new MercadoPagoOrderProvider(token);
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

    const status = mapProviderStatus(order.status);
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
        status,
        status_detail: order.statusDetail,
        qr_code: order.qrCode,
        qr_code_base64: order.qrCodeBase64,
        ticket_url: order.ticketUrl,
        expires_at: order.expiresAt,
        paid_at: status === "paid" ? new Date().toISOString() : null,
        metadata: { source: "subscription_renewal", attempt },
      })
      .select("id,provider_order_id,status")
      .single();
    if (error) throw error;
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
    const token = platformAccessToken();
    if (!token) throw new Error("PedeAqui billing Mercado Pago access token is not configured");
    const admin = createAdminClient();
    const actor = actorUserId ?? await systemActor();
    const { data: charge, error: chargeError } = await admin
      .from("subscription_pix_charges")
      .select("id,organization_id,subscription_id,invoice_id,provider_order_id,amount_cents,status")
      .eq("id", chargeId)
      .single();
    if (chargeError) throw chargeError;
    if (!charge.provider_order_id) throw new Error("PIX charge has no provider order id");

    const provider = new MercadoPagoOrderProvider(token);
    const order = await provider.getOrder(charge.provider_order_id);
    if (order.amountCents !== charge.amount_cents) throw new Error("PIX reconciliation amount mismatch");
    const status = mapProviderStatus(order.status);
    const paidAt = status === "paid" ? new Date().toISOString() : null;

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
        paid_at: paidAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", charge.id);
    if (updateError) throw updateError;

    if (status !== "paid") return { status, paymentRecorded: false };

    const { data: payment, error: paymentError } = await admin.rpc("subscription_payment_record_internal", {
      p_invoice_id: charge.invoice_id,
      p_amount_cents: charge.amount_cents,
      p_method: "pix",
      p_status: "paid",
      p_actor_user_id: actor,
      p_reason: "PIX da mensalidade confirmado automaticamente pelo Mercado Pago",
      p_protocol: `MP-${order.providerOrderId.slice(0, 40)}`,
      p_idempotency_key: `auto-pix-payment:${charge.id}`,
    });
    if (paymentError) throw paymentError;

    const { error: providerReferenceError } = await admin
      .from("subscription_payments")
      .update({ provider_key: PIX_PROVIDER_KEY, provider_reference: order.providerOrderId, updated_at: new Date().toISOString() })
      .eq("id", payment.id);
    if (providerReferenceError) throw providerReferenceError;

    const { data: subscription, error: subscriptionError } = await admin
      .from("organization_subscriptions")
      .select("id,billing_interval,next_due_at")
      .eq("id", charge.subscription_id)
      .single();
    if (subscriptionError) throw subscriptionError;

    if (subscription.next_due_at) {
      const nextDueAt = addInterval(subscription.next_due_at, subscription.billing_interval);
      const { error: nextDueError } = await admin
        .from("organization_subscriptions")
        .update({ next_due_at: nextDueAt, payment_status: "paid", updated_at: new Date().toISOString() })
        .eq("id", subscription.id);
      if (nextDueError) throw nextDueError;

      await admin.from("platform_financial_audit").insert({
        organization_id: charge.organization_id,
        actor_user_id: actor,
        action: "platform.subscription_pix_paid",
        entity_type: "subscription_pix_charge",
        entity_id: charge.id,
        after_data: { provider: PIX_PROVIDER_KEY, provider_order_id: order.providerOrderId, next_due_at: nextDueAt },
        reason: "PIX da mensalidade conciliado automaticamente",
        protocol: `MP-${order.providerOrderId.slice(0, 40)}`,
      });
    }

    return { status, paymentRecorded: true };
  }

  static newRequestId() {
    return randomUUID();
  }
}
