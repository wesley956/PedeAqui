import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { AccessContext } from "@/server/access/context";

export type OnboardingReadiness = {
  storeProfileComplete: boolean;
  storeSlug: string | null;
  productCount: number;
  hoursCount: number;
  paymentMethodCount: number;
  deliveryConfigured: boolean;
  driverCount: number;
  driverMobileAccessCount: number;
  orderCount: number;
};

const emptyReadiness: OnboardingReadiness = {
  storeProfileComplete: false,
  storeSlug: null,
  productCount: 0,
  hoursCount: 0,
  paymentMethodCount: 0,
  deliveryConfigured: false,
  driverCount: 0,
  driverMobileAccessCount: 0,
  orderCount: 0,
};

function countOf(result: { count: number | null; error: unknown }) {
  return result.error ? 0 : result.count ?? 0;
}

export class OnboardingReadinessService {
  static async load(context: AccessContext): Promise<OnboardingReadiness> {
    if (!context.storeId) return emptyReadiness;

    const admin = createAdminClient();
    const scope = { organizationId: context.organizationId, storeId: context.storeId };

    const [storeResult, productsResult, hoursResult, paymentsResult, deliveryResult, driversResult, mobileDriversResult, ordersResult] = await Promise.all([
      admin.from("stores")
        .select("name,phone,city,state,slug")
        .eq("id", scope.storeId)
        .eq("organization_id", scope.organizationId)
        .maybeSingle(),
      admin.from("products")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", scope.organizationId)
        .eq("store_id", scope.storeId)
        .eq("active", true)
        .is("deleted_at", null),
      admin.from("store_hours")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", scope.organizationId)
        .eq("store_id", scope.storeId)
        .eq("active", true),
      admin.from("store_payment_methods")
        .select("method", { count: "exact", head: true })
        .eq("organization_id", scope.organizationId)
        .eq("store_id", scope.storeId)
        .eq("enabled", true),
      admin.from("store_delivery_settings")
        .select("store_id,enabled")
        .eq("organization_id", scope.organizationId)
        .eq("store_id", scope.storeId)
        .maybeSingle(),
      admin.from("drivers")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", scope.organizationId)
        .eq("store_id", scope.storeId)
        .eq("active", true)
        .is("deleted_at", null),
      admin.from("drivers")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", scope.organizationId)
        .eq("store_id", scope.storeId)
        .eq("active", true)
        .not("user_id", "is", null)
        .is("deleted_at", null),
      admin.from("orders")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", scope.organizationId)
        .eq("store_id", scope.storeId),
    ]);

    const store = storeResult.error ? null : storeResult.data;
    const storeProfileComplete = Boolean(store?.name?.trim() && store?.phone?.trim() && store?.city?.trim() && store?.state?.trim());

    return {
      storeProfileComplete,
      storeSlug: store?.slug ?? null,
      productCount: countOf(productsResult),
      hoursCount: countOf(hoursResult),
      paymentMethodCount: countOf(paymentsResult),
      deliveryConfigured: !deliveryResult.error && Boolean(deliveryResult.data?.store_id),
      driverCount: countOf(driversResult),
      driverMobileAccessCount: countOf(mobileDriversResult),
      orderCount: countOf(ordersResult),
    };
  }
}
