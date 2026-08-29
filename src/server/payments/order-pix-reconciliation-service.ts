import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { OrderPaymentProviderConfigService } from "@/server/payments/order-payment-provider-config-service";
import { OrderPixService } from "@/server/payments/order-pix-service";

const STALE_AFTER_MS = 2 * 60 * 1000;
const MAX_BATCH = 50;

type PendingCharge = {
  id: string;
  store_id: string;
  provider_order_id: string;
};

export type PixReconciliationResult = {
  scanned: number;
  reconciled: number;
  failed: number;
};

export class OrderPixReconciliationService {
  static async runBatch(): Promise<PixReconciliationResult> {
    const admin = createAdminClient();
    const { data: configs, error: configError } = await admin.from("order_payment_provider_configs")
      .select("store_id")
      .eq("provider", "mercado_pago")
      .eq("enabled", true)
      .is("revoked_at", null);
    if (configError) throw configError;

    const storeIds = [...new Set((configs ?? []).map((item) => item.store_id).filter(Boolean))];
    if (!storeIds.length) return { scanned: 0, reconciled: 0, failed: 0 };

    const cutoff = new Date(Date.now() - STALE_AFTER_MS).toISOString();
    const { data: pending, error: pendingError } = await admin.from("order_payment_provider_charges")
      .select("id, store_id, provider_order_id")
      .in("store_id", storeIds)
      .eq("provider", "mercado_pago")
      .eq("status", "pending")
      .not("provider_order_id", "is", null)
      .or(`last_reconciled_at.is.null,last_reconciled_at.lt.${cutoff}`)
      .order("updated_at", { ascending: true })
      .limit(MAX_BATCH);
    if (pendingError) throw pendingError;

    const charges = (pending ?? []) as PendingCharge[];
    let reconciled = 0;
    let failed = 0;

    for (const charge of charges) {
      try {
        await OrderPixService.reconcile(charge.store_id, charge.provider_order_id);
        reconciled += 1;
      } catch {
        failed += 1;
        const now = new Date().toISOString();
        await admin.from("order_payment_provider_charges").update({
          last_reconciled_at: now,
          last_error_code: "reconciliation_failed",
          updated_at: now,
        }).eq("id", charge.id);
        await OrderPaymentProviderConfigService.recordHealth(charge.store_id, {
          status: "error",
          errorCode: "reconciliation_failed",
        }).catch(() => undefined);
      }
    }

    return { scanned: charges.length, reconciled, failed };
  }
}
