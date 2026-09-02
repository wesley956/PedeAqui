import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import type { NavigationAccess } from "@/server/access/navigation-access-service";
import { OperationalHealthService, type OperationalHealthSnapshot } from "@/server/operations/operational-health-service";

export type OperationHeaderData = {
  storeName: string | null;
  storeStatus: string | null;
  cashStatus: "open" | "closed" | null;
  cashRegisterName: string | null;
  health: OperationalHealthSnapshot;
  receiving: {
    accepting: boolean;
    reason: string | null;
    pausedAt: string | null;
    pausedBy: string | null;
    canManage: boolean;
  } | null;
};

export class OperationHeaderService {
  static async load(access: NavigationAccess): Promise<OperationHeaderData> {
    const { context, permissionKeys } = access;
    const supabase = await createClient();
    const healthPromise = OperationalHealthService.load(access);
    let storeName: string | null = null;
    let storeStatus: string | null = null;
    let receiving: OperationHeaderData["receiving"] = null;

    if (context.storeId) {
      const [{ data: store, error: storeError }, { data: menu, error: menuError }] = await Promise.all([
        supabase.from("stores").select("name, status").eq("organization_id", context.organizationId).eq("id", context.storeId).maybeSingle(),
        supabase.from("store_menu_settings").select("accepting_orders, pause_reason, paused_at, paused_by").eq("organization_id", context.organizationId).eq("store_id", context.storeId).maybeSingle(),
      ]);
      if (storeError) throw storeError;
      if (menuError) throw menuError;
      storeName = store?.name ?? null;
      storeStatus = store?.status ?? null;
      let pausedBy: string | null = null;
      if (menu?.paused_by) {
        const admin = createAdminClient();
        const { data } = await admin.auth.admin.getUserById(menu.paused_by);
        pausedBy = data.user?.email ?? "Usuário autorizado";
      }
      receiving = {
        accepting: menu?.accepting_orders ?? true,
        reason: menu?.pause_reason ?? null,
        pausedAt: menu?.paused_at ?? null,
        pausedBy,
        canManage: permissionKeys.includes(PERMISSIONS.STORES_MANAGE),
      };
    }

    if (!context.storeId || !permissionKeys.includes(PERMISSIONS.CASH_VIEW)) {
      return { storeName, storeStatus, cashStatus: null, cashRegisterName: null, health: await healthPromise, receiving };
    }

    await authorize(PERMISSIONS.CASH_VIEW, context);
    const admin = createAdminClient();
    const { data: session, error: sessionError } = await admin
      .from("cash_sessions")
      .select("cash_register_id")
      .eq("organization_id", context.organizationId)
      .eq("store_id", context.storeId)
      .eq("opened_by", context.userId)
      .eq("status", "open")
      .order("opened_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (sessionError) throw sessionError;

    if (!session) return { storeName, storeStatus, cashStatus: "closed", cashRegisterName: null, health: await healthPromise, receiving };

    const { data: register, error: registerError } = await admin
      .from("cash_registers")
      .select("name")
      .eq("organization_id", context.organizationId)
      .eq("store_id", context.storeId)
      .eq("id", session.cash_register_id)
      .maybeSingle();
    if (registerError) throw registerError;

    return { storeName, storeStatus, cashStatus: "open", cashRegisterName: register?.name ?? null, health: await healthPromise, receiving };
  }
}
