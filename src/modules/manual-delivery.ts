import type { ModuleKey } from "@/modules/module-catalog";

/**
 * Delivery is handled directly from the order flow whenever either logistics
 * surface is disabled for the store. Permissions are intentionally not part of
 * this decision: a user without delivery permission must not gain a manual
 * bypass while the store still uses managed logistics.
 */
export function isManualDeliveryMode(enabledModuleKeys: ReadonlySet<ModuleKey>) {
  return !enabledModuleKeys.has("deliveries") || !enabledModuleKeys.has("driver");
}

export function isOfflineDeliveryPayment(method: string | null | undefined) {
  return method === "cash" || method === "credit_card" || method === "debit_card";
}
