import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { authorize, AuthorizationError } from "@/server/access/authorize";
import { PERMISSIONS, type PermissionKey } from "@/server/access/permissions";
import {
  cashRegisterInputSchema,
  cashRegisterUpdateSchema,
  cashOpenSessionSchema,
  cashManualMovementSchema,
  cashCloseSessionSchema,
  type CashRegisterInput,
  type CashRegisterUpdateInput,
  type CashOpenSessionInput,
  type CashManualMovementInput,
  type CashCloseSessionInput,
} from "@/server/cash/schemas";

function requireStoreId(storeId: string | null) {
  if (!storeId) throw new Error("Selecione uma unidade para acessar o caixa.");
  return storeId;
}

async function can(permission: PermissionKey, context: Awaited<ReturnType<typeof authorize>>) {
  try {
    await authorize(permission, context);
    return true;
  } catch (error) {
    if (error instanceof AuthorizationError) return false;
    throw error;
  }
}

async function scopedRegister(registerId: string, organizationId: string, storeId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.from("cash_registers")
    .select("id, organization_id, store_id, code, name, active")
    .eq("id", registerId).eq("organization_id", organizationId).eq("store_id", storeId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Caixa não encontrado nesta unidade.");
  return data;
}

async function scopedSession(sessionId: string, organizationId: string, storeId: string) {
  const admin = createAdminClient();
  const { data, error } = await admin.from("cash_sessions")
    .select("id, organization_id, store_id, cash_register_id, status, opened_by")
    .eq("id", sessionId).eq("organization_id", organizationId).eq("store_id", storeId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Sessão de caixa não encontrada nesta unidade.");
  return data;
}

export class CashService {
  static async loadDashboard() {
    const context = await authorize(PERMISSIONS.CASH_VIEW);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();

    const [registersResult, sessionsResult, abilities] = await Promise.all([
      admin.from("cash_registers")
        .select("id, code, name, active, created_at, updated_at")
        .eq("organization_id", context.organizationId).eq("store_id", storeId)
        .order("active", { ascending: false }).order("code"),
      admin.from("cash_sessions")
        .select("id, cash_register_id, status, opening_balance_cents, expected_cash_cents_snapshot, counted_cash_cents, difference_cents, opened_by, closed_by, opened_at, closed_at")
        .eq("organization_id", context.organizationId).eq("store_id", storeId)
        .order("opened_at", { ascending: false }).limit(40),
      Promise.all([
        can(PERMISSIONS.CASH_MANAGE, context),
        can(PERMISSIONS.CASH_OPEN, context),
        can(PERMISSIONS.CASH_SUPPLY, context),
        can(PERMISSIONS.CASH_WITHDRAW, context),
        can(PERMISSIONS.CASH_CLOSE, context),
      ]),
    ]);
    if (registersResult.error) throw registersResult.error;
    if (sessionsResult.error) throw sessionsResult.error;

    const registers = registersResult.data ?? [];
    const sessions = sessionsResult.data ?? [];
    const currentSession = sessions.find((row) => row.status === "open" && row.opened_by === context.userId) ?? null;
    const registerMap = new Map(registers.map((row) => [row.id, row]));

    let movements: Array<Record<string, unknown>> = [];
    let summary: Record<string, unknown> | null = null;
    if (currentSession) {
      const [movementsResult, summaryResult] = await Promise.all([
        admin.from("cash_movements")
          .select("id, movement_type, direction, amount_cents, payment_id, order_id, reference_movement_id, reason, created_by, created_at")
          .eq("organization_id", context.organizationId).eq("store_id", storeId).eq("cash_session_id", currentSession.id)
          .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(100),
        admin.rpc("cash_session_summary_internal", { p_session_id: currentSession.id }),
      ]);
      if (movementsResult.error) throw movementsResult.error;
      if (summaryResult.error) throw summaryResult.error;
      movements = movementsResult.data ?? [];
      summary = summaryResult.data as Record<string, unknown> | null;
    }

    return {
      context,
      registers,
      sessions: sessions.map((session) => ({ ...session, register: registerMap.get(session.cash_register_id) ?? null })),
      currentSession: currentSession ? { ...currentSession, register: registerMap.get(currentSession.cash_register_id) ?? null } : null,
      movements,
      summary,
      abilities: {
        manage: abilities[0], open: abilities[1], supply: abilities[2], withdraw: abilities[3], close: abilities[4],
      },
    };
  }

  static async createRegister(input: CashRegisterInput) {
    const values = cashRegisterInputSchema.parse(input);
    const context = await authorize(PERMISSIONS.CASH_MANAGE);
    const storeId = requireStoreId(context.storeId);
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("cash_create_register_internal", {
      p_store_id: storeId, p_code: values.code, p_name: values.name, p_actor_user_id: context.userId,
    });
    if (error) throw error;
    return data;
  }

  static async updateRegister(registerId: string, input: CashRegisterUpdateInput) {
    const values = cashRegisterUpdateSchema.parse(input);
    const context = await authorize(PERMISSIONS.CASH_MANAGE);
    const storeId = requireStoreId(context.storeId);
    await scopedRegister(registerId, context.organizationId, storeId);
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("cash_update_register_internal", {
      p_cash_register_id: registerId, p_name: values.name, p_active: values.active, p_actor_user_id: context.userId,
    });
    if (error) throw error;
    return data;
  }

  static async openSession(input: CashOpenSessionInput) {
    const values = cashOpenSessionSchema.parse(input);
    const context = await authorize(PERMISSIONS.CASH_OPEN);
    const storeId = requireStoreId(context.storeId);
    await scopedRegister(values.cashRegisterId, context.organizationId, storeId);
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("cash_open_session_internal", {
      p_cash_register_id: values.cashRegisterId,
      p_opening_balance_cents: values.openingBalanceCents,
      p_idempotency_key: values.idempotencyKey,
      p_note: values.note ?? null,
      p_actor_user_id: context.userId,
    });
    if (error) throw error;
    return data;
  }

  static async manualMovement(input: CashManualMovementInput) {
    const values = cashManualMovementSchema.parse(input);
    const permission = values.type === "supply" ? PERMISSIONS.CASH_SUPPLY : PERMISSIONS.CASH_WITHDRAW;
    const context = await authorize(permission);
    const storeId = requireStoreId(context.storeId);
    await scopedSession(values.sessionId, context.organizationId, storeId);
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("cash_manual_movement_internal", {
      p_session_id: values.sessionId,
      p_type: values.type,
      p_amount_cents: values.amountCents,
      p_reason: values.reason,
      p_idempotency_key: values.idempotencyKey,
      p_actor_user_id: context.userId,
    });
    if (error) throw error;
    return data;
  }

  static async closeSession(input: CashCloseSessionInput) {
    const values = cashCloseSessionSchema.parse(input);
    const context = await authorize(PERMISSIONS.CASH_CLOSE);
    const storeId = requireStoreId(context.storeId);
    await scopedSession(values.sessionId, context.organizationId, storeId);
    const admin = createAdminClient();
    const { data, error } = await admin.rpc("cash_close_session_internal", {
      p_session_id: values.sessionId,
      p_counted_cash_cents: values.countedCashCents,
      p_idempotency_key: values.idempotencyKey,
      p_note: values.note ?? null,
      p_actor_user_id: context.userId,
    });
    if (error) throw error;
    return data;
  }
}
