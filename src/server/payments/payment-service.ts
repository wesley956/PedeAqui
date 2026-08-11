import "server-only";

import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import { AuditService } from "@/server/audit/audit-service";
import { summarizePayments, type PaymentMethod, type PaymentRecordStatus } from "@/server/payments/payment-model";

const uuid = z.string().uuid();
const methodSchema = z.enum(["cash", "pix", "credit_card", "debit_card"]);
const createSchema = z.object({
  orderId: z.string().uuid(),
  method: methodSchema,
  amountCents: z.number().int().positive(),
  cashTenderedCents: z.number().int().positive().nullable().optional(),
  reference: z.string().trim().max(200).nullable().optional(),
  idempotencyKey: z.string().trim().min(8).max(240).optional(),
});
const confirmSchema = z.object({
  cashReceivedCents: z.number().int().positive().nullable().optional(),
  reference: z.string().trim().max(200).nullable().optional(),
});

function requireStore(storeId: string | null) {
  if (!storeId) throw new Error("An active store is required");
  return storeId;
}

export class PaymentService {
  static async listForOrder(orderId: string) {
    const id = uuid.parse(orderId);
    const context = await authorize(PERMISSIONS.PAYMENTS_VIEW);
    const storeId = requireStore(context.storeId);
    const admin = createAdminClient();
    const [{ data: order, error: orderError }, { data, error }] = await Promise.all([
      admin.from("orders").select("id, total_cents, payment_status").eq("id", id).eq("organization_id", context.organizationId).eq("store_id", storeId).maybeSingle(),
      admin.from("payments").select("id, order_id, method, status, amount_cents, cash_tendered_cents, change_due_cents, reference, source, paid_at, failed_at, created_at, updated_at")
        .eq("organization_id", context.organizationId).eq("store_id", storeId).eq("order_id", id).order("created_at"),
    ]);
    if (orderError) throw orderError;
    if (error) throw error;
    if (!order) throw new Error("Order not found");
    const payments = data ?? [];
    const summary = summarizePayments(payments.map((payment) => ({ amountCents: Number(payment.amount_cents), status: payment.status as PaymentRecordStatus })), Number(order.total_cents));
    return { context, order, payments, summary };
  }

  static async createIntent(input: z.input<typeof createSchema>) {
    const values = createSchema.parse(input);
    const context = await authorize(PERMISSIONS.PAYMENTS_MANAGE);
    const storeId = requireStore(context.storeId);
    const admin = createAdminClient();
    const { data: order, error: orderError } = await admin.from("orders").select("id").eq("id", values.orderId)
      .eq("organization_id", context.organizationId).eq("store_id", storeId).maybeSingle();
    if (orderError) throw orderError;
    if (!order) throw new Error("Order not found");
    const { data, error } = await admin.rpc("payment_create_intent_internal", {
      p_order_id: values.orderId,
      p_method: values.method,
      p_amount_cents: values.amountCents,
      p_idempotency_key: values.idempotencyKey ?? `manual:${values.orderId}:${randomUUID()}`,
      p_cash_tendered_cents: values.method === "cash" ? (values.cashTenderedCents ?? null) : null,
      p_reference: values.reference ?? null,
      p_actor_user_id: context.userId,
      p_source: "panel",
    });
    if (error) throw error;
    await AuditService.record(context, { action: "payment.intent_created", entityType: "payment", entityId: data.id, after: { orderId: values.orderId, method: values.method, amountCents: values.amountCents } });
    return data;
  }

  static async confirm(paymentId: string, input: z.input<typeof confirmSchema> = {}) {
    const id = uuid.parse(paymentId);
    const values = confirmSchema.parse(input);
    const context = await authorize(PERMISSIONS.PAYMENTS_MANAGE);
    const storeId = requireStore(context.storeId);
    const admin = createAdminClient();
    const { data: scoped, error: scopedError } = await admin.from("payments").select("id, order_id, method, status, amount_cents, cash_tendered_cents")
      .eq("id", id).eq("organization_id", context.organizationId).eq("store_id", storeId).maybeSingle();
    if (scopedError) throw scopedError;
    if (!scoped) throw new Error("Payment not found");
    const { data, error } = await admin.rpc("payment_confirm_internal", {
      p_payment_id: id,
      p_cash_received_cents: scoped.method === "cash" ? (values.cashReceivedCents ?? null) : null,
      p_reference: values.reference ?? null,
      p_actor_user_id: context.userId,
      p_source: "panel",
    });
    if (error) throw error;
    await AuditService.record(context, { action: "payment.confirmed", entityType: "payment", entityId: id, before: scoped, after: data });
    return data;
  }

  static async confirmDefaultForOrder(orderId: string, input: z.input<typeof confirmSchema> = {}) {
    const id = uuid.parse(orderId);
    const context = await authorize(PERMISSIONS.PAYMENTS_MANAGE);
    const storeId = requireStore(context.storeId);
    const admin = createAdminClient();
    const { data, error } = await admin.from("payments").select("id, method, status, amount_cents, cash_tendered_cents")
      .eq("organization_id", context.organizationId).eq("store_id", storeId).eq("order_id", id)
      .in("status", ["pending", "authorized"]).order("created_at");
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("No pending payment found");
    if (data.length > 1) throw new Error("This order has multiple pending payments; confirm a specific payment");
    return this.confirm(data[0].id, input);
  }

  static async fail(paymentId: string, reason: string) {
    const id = uuid.parse(paymentId);
    const safeReason = z.string().trim().min(3).max(240).parse(reason);
    const context = await authorize(PERMISSIONS.PAYMENTS_MANAGE);
    const storeId = requireStore(context.storeId);
    const admin = createAdminClient();
    const { data: scoped, error: scopedError } = await admin.from("payments").select("id, order_id, method, status, amount_cents")
      .eq("id", id).eq("organization_id", context.organizationId).eq("store_id", storeId).maybeSingle();
    if (scopedError) throw scopedError;
    if (!scoped) throw new Error("Payment not found");
    const { data, error } = await admin.rpc("payment_fail_internal", {
      p_payment_id: id,
      p_reason: safeReason,
      p_actor_user_id: context.userId,
      p_source: "panel",
    });
    if (error) throw error;
    await AuditService.record(context, { action: "payment.failed", entityType: "payment", entityId: id, before: scoped, after: data });
    return data;
  }

  static methodLabel(method: PaymentMethod) {
    return ({ cash: "Dinheiro", pix: "Pix", credit_card: "Cartão de crédito", debit_card: "Cartão de débito" } as const)[method];
  }
}
