import "server-only";

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertNoScheduleOverlap } from "@/server/menu/schedule";
import { PlatformAdminService, PlatformAuthorizationError } from "@/server/platform/platform-admin-service";

const uuid = z.string().uuid();
const commonSchema = z.object({
  organizationId: uuid,
  storeId: uuid,
  reason: z.string().trim().min(5).max(500),
  protocol: z.string().trim().min(3).max(120),
  idempotencyKey: z.string().trim().min(8).max(200),
});
const paymentMethodSchema = z.enum(["cash", "pix", "credit_card", "debit_card"]);
const storeStatusSchema = z.enum(["active", "inactive", "temporarily_closed"]);

export type PlatformSupportCommon = z.infer<typeof commonSchema>;

type ActionContext = PlatformSupportCommon & {
  actorUserId: string;
  admin: ReturnType<typeof createAdminClient>;
};

type ActionResult = { duplicate: boolean; action: string };

async function requireOperator() {
  const access = await PlatformAdminService.access();
  if (access.role !== "super_admin") throw new PlatformAuthorizationError();
  return { ...access, admin: createAdminClient() };
}

async function assertTarget(admin: ReturnType<typeof createAdminClient>, organizationId: string, storeId: string) {
  const { data, error } = await admin.from("stores").select("id,organization_id,status").eq("id", storeId).eq("organization_id", organizationId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Unidade não encontrada para a empresa selecionada.");
  return data;
}

async function claim(ctx: ActionContext, action: string) {
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const { error } = await ctx.admin.from("idempotency_keys").insert({
    organization_id: ctx.organizationId,
    store_id: ctx.storeId,
    scope: `platform.support.${action}`,
    idempotency_key: ctx.idempotencyKey,
    request_fingerprint: `${ctx.storeId}:${action}`,
    status: "processing",
    expires_at: expiresAt,
  });
  if (!error) return true;
  if (error.code === "23505") return false;
  throw error;
}

async function finishClaim(ctx: ActionContext, action: string, success: boolean) {
  await ctx.admin.from("idempotency_keys").update({
    status: success ? "completed" : "failed",
    response_code: success ? 200 : 500,
    response_body: { action, success },
    updated_at: new Date().toISOString(),
  }).eq("organization_id", ctx.organizationId).eq("scope", `platform.support.${action}`).eq("idempotency_key", ctx.idempotencyKey);
}

async function record(ctx: ActionContext, action: string, entityType: string, entityId: string, before: unknown, after: unknown) {
  const { error: auditError } = await ctx.admin.from("audit_logs").insert({
    organization_id: ctx.organizationId,
    store_id: ctx.storeId,
    actor_user_id: ctx.actorUserId,
    action: `platform.support.${action}`,
    entity_type: entityType,
    entity_id: entityId,
    before_data: before ?? null,
    after_data: { value: after ?? null, support_reason: ctx.reason },
    request_id: ctx.protocol,
  });
  if (auditError) throw auditError;

  const { error: eventError } = await ctx.admin.from("domain_events").insert({
    organization_id: ctx.organizationId,
    store_id: ctx.storeId,
    event_type: `platform.support.${action}`,
    entity_type: entityType,
    entity_id: entityId,
    payload: { protocol: ctx.protocol, reason: ctx.reason },
    created_by: ctx.actorUserId,
  });
  if (eventError) throw eventError;
}

async function runAction(
  action: string,
  input: PlatformSupportCommon,
  operation: (ctx: ActionContext) => Promise<{ before: unknown; after: unknown; entityType?: string; entityId?: string }>,
): Promise<ActionResult> {
  const common = commonSchema.parse(input);
  const operator = await requireOperator();
  await assertTarget(operator.admin, common.organizationId, common.storeId);
  const ctx: ActionContext = { ...common, actorUserId: operator.user.id, admin: operator.admin };
  const claimed = await claim(ctx, action);
  if (!claimed) return { duplicate: true, action };

  try {
    const result = await operation(ctx);
    await record(ctx, action, result.entityType ?? "store", result.entityId ?? ctx.storeId, result.before, result.after);
    await finishClaim(ctx, action, true);
    return { duplicate: false, action };
  } catch (error) {
    await finishClaim(ctx, action, false);
    throw error;
  }
}

export class PlatformSupportActionService {
  static async setStoreStatus(input: PlatformSupportCommon & { status: "active" | "inactive" | "temporarily_closed" }) {
    const status = storeStatusSchema.parse(input.status);
    return runAction("store_status", input, async (ctx) => {
      const { data: before, error: beforeError } = await ctx.admin.from("stores").select("id,status,updated_at").eq("id", ctx.storeId).eq("organization_id", ctx.organizationId).single();
      if (beforeError) throw beforeError;
      const { data: after, error } = await ctx.admin.from("stores").update({ status, updated_at: new Date().toISOString() }).eq("id", ctx.storeId).eq("organization_id", ctx.organizationId).select("id,status,updated_at").single();
      if (error) throw error;
      return { before, after };
    });
  }

  static async setMenuPublished(input: PlatformSupportCommon & { active: boolean }) {
    return runAction("menu_published", input, async (ctx) => {
      const { data: before, error: beforeError } = await ctx.admin.from("store_menu_settings").select("active,updated_at").eq("organization_id", ctx.organizationId).eq("store_id", ctx.storeId).maybeSingle();
      if (beforeError) throw beforeError;
      const { data: after, error } = await ctx.admin.from("store_menu_settings").upsert({ organization_id: ctx.organizationId, store_id: ctx.storeId, active: input.active, updated_at: new Date().toISOString() }, { onConflict: "store_id" }).select("active,updated_at").single();
      if (error) throw error;
      return { before, after };
    });
  }

  static async setAcceptingOrders(input: PlatformSupportCommon & { accepting: boolean; pauseReason?: string | null }) {
    const pauseReason = input.accepting ? null : z.string().trim().min(3).max(240).parse(input.pauseReason || "Pausa solicitada pelo restaurante");
    return runAction("accepting_orders", input, async (ctx) => {
      const { data: before, error: beforeError } = await ctx.admin.from("store_menu_settings").select("accepting_orders,pause_reason,paused_at").eq("organization_id", ctx.organizationId).eq("store_id", ctx.storeId).maybeSingle();
      if (beforeError) throw beforeError;
      const now = new Date().toISOString();
      const { data: after, error } = await ctx.admin.from("store_menu_settings").upsert({
        organization_id: ctx.organizationId,
        store_id: ctx.storeId,
        accepting_orders: input.accepting,
        pause_reason: pauseReason,
        paused_at: input.accepting ? null : now,
        paused_by: input.accepting ? null : ctx.actorUserId,
        updated_at: now,
      }, { onConflict: "store_id" }).select("accepting_orders,pause_reason,paused_at").single();
      if (error) throw error;
      return { before, after };
    });
  }

  static async setFulfillment(input: PlatformSupportCommon & { allowDelivery: boolean; allowPickup: boolean }) {
    if (!input.allowDelivery && !input.allowPickup) throw new Error("Mantenha pelo menos entrega ou retirada habilitada.");
    return runAction("fulfillment", input, async (ctx) => {
      const { data: before, error: beforeError } = await ctx.admin.from("store_menu_settings").select("allow_delivery,allow_pickup,updated_at").eq("organization_id", ctx.organizationId).eq("store_id", ctx.storeId).maybeSingle();
      if (beforeError) throw beforeError;
      const { data: after, error } = await ctx.admin.from("store_menu_settings").upsert({ organization_id: ctx.organizationId, store_id: ctx.storeId, allow_delivery: input.allowDelivery, allow_pickup: input.allowPickup, updated_at: new Date().toISOString() }, { onConflict: "store_id" }).select("allow_delivery,allow_pickup,updated_at").single();
      if (error) throw error;
      return { before, after };
    });
  }

  static async setPaymentMethod(input: PlatformSupportCommon & { method: "cash" | "pix" | "credit_card" | "debit_card"; enabled: boolean }) {
    const method = paymentMethodSchema.parse(input.method);
    return runAction(`payment_${method}`, input, async (ctx) => {
      const { data: before, error: beforeError } = await ctx.admin.from("store_payment_methods").select("method,enabled,sort_order,updated_at").eq("organization_id", ctx.organizationId).eq("store_id", ctx.storeId).eq("method", method).maybeSingle();
      if (beforeError) throw beforeError;
      const { data: after, error } = await ctx.admin.from("store_payment_methods").upsert({ organization_id: ctx.organizationId, store_id: ctx.storeId, method, enabled: input.enabled, sort_order: before?.sort_order ?? 0, updated_at: new Date().toISOString() }, { onConflict: "store_id,method" }).select("method,enabled,sort_order,updated_at").single();
      if (error) throw error;
      return { before, after, entityType: "store_payment_method" };
    });
  }

  static async addStoreHour(input: PlatformSupportCommon & { weekday: number; opensAt: string; closesAt: string; closesNextDay: boolean }) {
    const values = z.object({
      weekday: z.number().int().min(0).max(6),
      opensAt: z.string().regex(/^\d{2}:\d{2}$/),
      closesAt: z.string().regex(/^\d{2}:\d{2}$/),
      closesNextDay: z.boolean(),
    }).parse(input);
    if (values.opensAt === values.closesAt) throw new Error("O horário de abertura e fechamento não pode ser igual.");

    return runAction("store_hour", input, async (ctx) => {
      const { data: current, error: currentError } = await ctx.admin.from("store_hours").select("id,weekday,opens_at,closes_at,closes_next_day,sort_order,active").eq("organization_id", ctx.organizationId).eq("store_id", ctx.storeId);
      if (currentError) throw currentError;
      const exact = (current ?? []).find((row) => row.weekday === values.weekday && row.opens_at.slice(0, 5) === values.opensAt && row.closes_at.slice(0, 5) === values.closesAt && row.closes_next_day === values.closesNextDay);
      if (exact) {
        const { data: after, error } = await ctx.admin.from("store_hours").update({ active: true, updated_at: new Date().toISOString() }).eq("id", exact.id).eq("organization_id", ctx.organizationId).eq("store_id", ctx.storeId).select("id,weekday,opens_at,closes_at,closes_next_day,active").single();
        if (error) throw error;
        return { before: exact, after, entityType: "store_hour", entityId: exact.id };
      }

      assertNoScheduleOverlap([
        ...(current ?? []).filter((row) => row.active).map((row) => ({ weekday: row.weekday, opensAt: row.opens_at.slice(0, 5), closesAt: row.closes_at.slice(0, 5), closesNextDay: row.closes_next_day })),
        { weekday: values.weekday, opensAt: values.opensAt, closesAt: values.closesAt, closesNextDay: values.closesNextDay },
      ]);
      const { data: after, error } = await ctx.admin.from("store_hours").insert({ organization_id: ctx.organizationId, store_id: ctx.storeId, weekday: values.weekday, opens_at: values.opensAt, closes_at: values.closesAt, closes_next_day: values.closesNextDay, sort_order: 0, active: true }).select("id,weekday,opens_at,closes_at,closes_next_day,active").single();
      if (error) throw error;
      return { before: null, after, entityType: "store_hour", entityId: after.id };
    });
  }

  static async configureDelivery(input: PlatformSupportCommon & {
    enabled: boolean;
    feeMode: "default" | "neighborhood";
    defaultFeeCents: number;
    estimatedMinMinutes: number;
    estimatedMaxMinutes: number;
    requireNeighborhoodMatch: boolean;
  }) {
    const values = z.object({
      enabled: z.boolean(),
      feeMode: z.enum(["default", "neighborhood"]),
      defaultFeeCents: z.number().int().nonnegative(),
      estimatedMinMinutes: z.number().int().min(0).max(1440),
      estimatedMaxMinutes: z.number().int().min(0).max(1440),
      requireNeighborhoodMatch: z.boolean(),
    }).refine((value) => value.estimatedMinMinutes <= value.estimatedMaxMinutes, { message: "Tempo mínimo não pode superar o máximo." }).parse(input);

    return runAction("delivery_settings", input, async (ctx) => {
      const { data: before, error: beforeError } = await ctx.admin.from("store_delivery_settings").select("enabled,fee_mode,default_fee_cents,estimated_min_minutes,estimated_max_minutes,require_neighborhood_match,updated_at").eq("organization_id", ctx.organizationId).eq("store_id", ctx.storeId).maybeSingle();
      if (beforeError) throw beforeError;
      const { data: after, error } = await ctx.admin.from("store_delivery_settings").upsert({
        organization_id: ctx.organizationId,
        store_id: ctx.storeId,
        enabled: values.enabled,
        fee_mode: values.feeMode,
        default_fee_cents: values.defaultFeeCents,
        estimated_min_minutes: values.estimatedMinMinutes,
        estimated_max_minutes: values.estimatedMaxMinutes,
        require_neighborhood_match: values.requireNeighborhoodMatch,
        updated_at: new Date().toISOString(),
      }, { onConflict: "store_id" }).select("enabled,fee_mode,default_fee_cents,estimated_min_minutes,estimated_max_minutes,require_neighborhood_match,updated_at").single();
      if (error) throw error;
      return { before, after };
    });
  }
}
