import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { authorize } from "@/server/access/authorize";
import { PERMISSIONS } from "@/server/access/permissions";
import type { NavigationAccess } from "@/server/access/navigation-access-service";

export type OperationHeaderData = {
  storeName: string | null;
  storeStatus: string | null;
  cashStatus: "open" | "closed" | null;
  cashRegisterName: string | null;
};

export class OperationHeaderService {
  static async load(access: NavigationAccess): Promise<OperationHeaderData> {
    const { context, permissionKeys } = access;
    const supabase = await createClient();
    let storeName: string | null = null;
    let storeStatus: string | null = null;

    if (context.storeId) {
      const { data: store, error: storeError } = await supabase
        .from("stores")
        .select("name, status")
        .eq("organization_id", context.organizationId)
        .eq("id", context.storeId)
        .maybeSingle();
      if (storeError) throw storeError;
      storeName = store?.name ?? null;
      storeStatus = store?.status ?? null;
    }

    if (!context.storeId || !permissionKeys.includes(PERMISSIONS.CASH_VIEW)) {
      return { storeName, storeStatus, cashStatus: null, cashRegisterName: null };
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

    if (!session) return { storeName, storeStatus, cashStatus: "closed", cashRegisterName: null };

    const { data: register, error: registerError } = await admin
      .from("cash_registers")
      .select("name")
      .eq("organization_id", context.organizationId)
      .eq("store_id", context.storeId)
      .eq("id", session.cash_register_id)
      .maybeSingle();
    if (registerError) throw registerError;

    return { storeName, storeStatus, cashStatus: "open", cashRegisterName: register?.name ?? null };
  }
}
