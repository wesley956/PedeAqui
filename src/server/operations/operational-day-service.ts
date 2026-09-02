import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { NavigationAccess } from "@/server/access/navigation-access-service";
import { OnboardingReadinessService } from "@/server/onboarding/onboarding-readiness-service";
import { OperationalHealthService } from "@/server/operations/operational-health-service";

export class OperationalDayService {
  static async load(access: NavigationAccess) {
    const { context } = access;
    if (!context.storeId) throw new Error("Selecione uma unidade para abrir a operação.");
    const admin = createAdminClient();
    const [readiness, health, menuResult, activeOrdersResult, cashResult, conversationsResult] = await Promise.all([
      OnboardingReadinessService.load(context),
      OperationalHealthService.load(access),
      admin.from("store_menu_settings").select("active,accepting_orders,pause_reason,paused_at").eq("organization_id", context.organizationId).eq("store_id", context.storeId).maybeSingle(),
      admin.from("orders").select("id", { count: "exact", head: true }).eq("organization_id", context.organizationId).eq("store_id", context.storeId).not("order_status", "in", "(completed,rejected,canceled)"),
      admin.from("cash_sessions").select("id", { count: "exact", head: true }).eq("organization_id", context.organizationId).eq("store_id", context.storeId).eq("status", "open"),
      admin.from("conversations").select("id", { count: "exact", head: true }).eq("organization_id", context.organizationId).eq("store_id", context.storeId).in("status", ["waiting_agent", "human"]),
    ]);
    for (const result of [menuResult, activeOrdersResult, cashResult]) if (result.error) throw result.error;
    const moduleVisible = (key: string) => access.items.some((item) => item.key === key);
    return {
      readiness,
      health,
      menu: menuResult.data ?? { active: true, accepting_orders: true, pause_reason: null, paused_at: null },
      pending: {
        orders: activeOrdersResult.count ?? 0,
        cashSessions: moduleVisible("cash") ? cashResult.count ?? 0 : null,
        conversations: moduleVisible("conversations") && !conversationsResult.error ? conversationsResult.count ?? 0 : null,
        printing: health.issues.filter((issue) => issue.area === "printing").length,
        payments: health.issues.filter((issue) => issue.area === "payments").length,
      },
      modules: {
        cash: moduleVisible("cash"),
        delivery: moduleVisible("deliveries"),
        inventory: moduleVisible("inventory"),
        conversations: moduleVisible("conversations"),
      },
    };
  }
}
